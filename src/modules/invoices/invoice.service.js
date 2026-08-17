const prisma = require('../../config/database');
const aiService = require('../ai/ai.service');
const qstashService = require("../../queues/invoice.qstash");
const { is } = require('zod/locales');
const storage = require('../../storage/storage.service');
const { Parser } = require("json2csv");
const ExcelJS = require("exceljs");

function isExcelFile(mimetype, filename) {
    if (mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        mimetype === "application/vnd.ms-excel") {
        return true;
    }
    if (typeof filename === 'string' &&
        (filename.endsWith('.xlsx') || filename.endsWith('.xls'))) {
        return true;
    }
    return false;
}

function isCsvFile(mimetype, filename) {
    return (
        mimetype === 'text/csv' ||
        mimetype === 'application/csv' ||
        (typeof filename === 'string' && filename.endsWith('.csv'))
    );
}

const OVERDUE_ELIGIBLE_STATUSES = ["SENT", "UNPAID"];

// Flips any already-fetched invoices past their due date to OVERDUE.
// Skips the write entirely when nothing in the batch actually needs it.
async function markOverdueInvoices(invoices) {
    const list = Array.isArray(invoices) ? invoices : [invoices];
    const now = new Date();

    const overdueIds = list
        .filter((inv) => inv && OVERDUE_ELIGIBLE_STATUSES.includes(inv.status) && inv.dueDate < now)
        .map((inv) => inv.id);

    if (overdueIds.length) {
        await prisma.invoiceBill.updateMany({
            where: { id: { in: overdueIds } },
            data: { status: "OVERDUE" },
        });

        const overdueIdSet = new Set(overdueIds.map(String));
        list.forEach((inv) => {
            if (inv && overdueIdSet.has(String(inv.id))) {
                inv.status = "OVERDUE";
            }
        });
    }

    return invoices;
}

function normalizeCustomFields(customFields) {
    if (!Array.isArray(customFields)) return [];

    return customFields
        .map((entry) => {
            if (!entry || typeof entry !== "object") return null;

            if (typeof entry.name === "string") {
                const name = entry.name.trim();
                if (!name) return null;
                return {
                    name,
                    value: entry.value == null ? "" : String(entry.value),
                };
            }

            const [name, value] = Object.entries(entry)[0] || [];
            if (!name || typeof name !== "string" || !name.trim()) return null;

            return {
                name: name.trim(),
                value: value == null ? "" : String(value),
            };
        })
        .filter(Boolean);
}

async function saveInvoiceCustomFields(tx, orgId, invoiceId, customFields) {
    const normalized = normalizeCustomFields(customFields);
    if (!normalized.length) return;

    for (const field of normalized) {
        const definition = await tx.customFieldDefinition.findUnique({
            where: {
                orgId_name: {
                    orgId: BigInt(orgId),
                    name: field.name,
                },
            },
        });

        if (!definition) {
            throw new Error(`Custom field "${field.name}" is not defined in settings.`);
        }

        await tx.invoiceCustomFieldValue.create({
            data: {
                invoiceId: BigInt(invoiceId),
                customFieldId: definition.id,
                orgId: BigInt(orgId),
                value: field.value,
            },
        });
    }
}

async function previewInvoiceAI(file) {
    const { path, mimetype, originalname } = file;
    //Excel 
    if (isExcelFile(mimetype, originalname)) {
        const parsed = await aiService.parseInvoiceFromExcel(path);
        return {
            source: "gemini-vision-excel",
            parsedData: parsed,
            confidence: parsed.confidence || null,
        };
    }

    if (isCsvFile(mimetype, originalname)) {
        const parsed = await aiService.parseInvoiceFromCsv(path);
        return {
            source: "gemini-vision-csv",
            parsedData: parsed,
            confidence: parsed.confidence || null,
        };
    }


    //Pdf and Image
    const parsed = await aiService.parseInvoiceFromFile(path);

    return {
        source: "gemini-vision",
        parsedData: parsed,
        confidence: parsed.confidence || null,
    };
}

// STEP 2: SAVE CONFIRMED DATA
async function saveInvoiceFromPreview(user, payload) {
    return await prisma.$transaction(async (tx) => {


        const subtotal = payload.subtotal ?? 0;
        const discount = payload.discount ?? 0;
        const taxAmount = payload.taxAmount ?? 0;
        const shippingCost = payload.shippingCost ?? 0;

        const totalAmount =
            payload.totalAmount ??
            (subtotal - discount + taxAmount + shippingCost);

        const paidAmount = payload.paidAmount ?? 0;
        const balanceDue = totalAmount - paidAmount;

        const exchangeRate = payload.exchangeRate ?? 1;
        const baseAmount = totalAmount * exchangeRate;
        const client =
            payload.buyer
                ? await tx.client.create({
                    data: {
                        orgId: BigInt(user.orgId),
                        name: payload.buyer.name,
                        email: payload.buyer.email,
                        phone: payload.buyer.phone,
                        streetAddress: payload.buyer.address?.street,
                        city: payload.buyer.address?.city,
                        state: payload.buyer.address?.state,
                        zipCode: payload.buyer.address?.zipCode,
                        country: payload.buyer.address?.country,
                        companyType: payload.buyer.companyType,
                        gstin: payload.buyer.gstin,
                        taxId: payload.buyer.taxId,
                        taxSystem: payload.buyer.taxSystem ?? "NONE",
                        isActive: true,
                    },
                })
                : null;

        // 1️⃣ Create invoice
        const invoice = await tx.invoiceBill.create({
            data: {
                orgId: BigInt(user.orgId),
                customerId: BigInt(user.userId),
                clientId: client ? client.id : null,

                invoiceNumber:
                    payload.invoiceNumber ??
                    `INV-${user.userId}-${(
                        Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
                    ).toUpperCase()}`,

                invoiceType: payload.invoiceType ?? "TAX",
                issueDate: payload.invoiceDate ? new Date(payload.invoiceDate) : new Date(),
                dueDate: payload.dueDate ? new Date(payload.dueDate) : new Date(),
                paymentTerms: payload.paymentTerms ?? "Due on receipt",

                currency: payload.currency ?? "USD",
                exchangeRate,
                baseCurrency: payload.baseCurrency ?? "INR",
                baseAmount,

                subtotal,
                discount,
                taxAmount,
                shippingCost,
                totalAmount,

                paidAmount,
                balanceDue,

                status: payload.status ?? "UNPAID",
                category: payload.category ?? "OTHER",
                confirmedAt: new Date(),

                // 🧾 Seller snapshot (important for legal/history)
                sellerName: payload.seller?.name,
                sellerEmail: payload.seller?.email,
                sellerPhone: payload.seller?.phone,
                sellerStreetAddress: payload.seller?.streetAddress,
                sellerCity: payload.seller?.city,
                sellerState: payload.seller?.state,
                sellerZipCode: payload.seller?.zipCode,
                sellerCountry: payload.seller?.country,
                sellerTaxId: payload.seller?.taxId,
                iecCode: payload.seller?.iecCode,
                lutFiled: payload.seller?.lutFiled ?? false,

                // 🧮 Tax & compliance
                taxType: payload.taxType ?? "NONE",
                placeOfSupply: payload.placeOfSupply,
                reverseCharge: payload.reverseCharge ?? false,
                reverseReason: payload.reverseReason,
                sacCode: payload.sacCode,
                taxSummary: payload.taxSummary,

                // 🚚 Shipping / trade
                shipToName: payload.shipTo?.name,
                shipToAddress: payload.shipTo?.address,
                countryOfOrigin: payload.countryOfOrigin,
                countryOfDestination: payload.countryOfDestination,
                incoterms: payload.incoterms,

                // 💳 Payment
                bankDetails: payload.bankDetails,
                paymentLink: payload.paymentLink,
                bankAddress: payload.bankAddress,

                // ⚖️ Legal
                jurisdiction: payload.jurisdiction,
                lateFeePolicy: payload.lateFeePolicy,
                notes: payload.notes,
            },
        });

        // 2️⃣ Create invoice items
        if (Array.isArray(payload.items)) {
            for (const item of payload.items) {
                await tx.invoiceBillItem.create({
                    data: {
                        invoiceId: invoice.id,
                        itemName: item.name,
                        description: item.description,
                        quantity: item.quantity ?? 1,
                        unitType: item.unitType ?? "UNIT",
                        unitPrice: item.unitPrice ?? 0,
                        taxRate: item.taxRate ?? 0,
                        totalPrice: item.itemTotal ?? 0,
                    },
                });
            }
        }

        await saveInvoiceCustomFields(tx, user.orgId, invoice.id, payload.customFields);

        return invoice;
    });
}

async function listInvoices(user, page = 1, limit = 10, startDate, endDate) {
    page = Number(page);
    limit = Number(limit);

    if (Number.isNaN(page) || page < 1) page = 1;
    if (Number.isNaN(limit) || limit < 1) limit = 10;

    const offset = (page - 1) * limit;

    // Build dynamic where condition
    const where = {
        orgId: BigInt(user.orgId),
    };
    // Add date filter only if provided
    if (startDate || endDate) {
        where.issueDate = {};

        if (startDate) {
            where.issueDate.gte = new Date(startDate);
        }

        if (endDate) {
            // Optional: make endDate inclusive for whole day
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            where.issueDate.lte = end;
        }
    }
    const invoices = await prisma.invoiceBill.findMany({
        where,
        include: {
            items: true,
            customFields: {
                include: {
                    customField: true,
                },
            },
        },
        orderBy: {
            createdAt: 'desc',
        },
        take: limit,
        skip: offset,
    });

    return markOverdueInvoices(invoices);
}

async function listInvoiceProducts(invoiceId, page = 1, limit = 10) {
    page = Number(page);
    limit = Number(limit);

    if (Number.isNaN(page) || page < 1) page = 1;
    if (Number.isNaN(limit) || limit < 1) limit = 10;
    const offset = (page - 1) * limit;
    return prisma.invoiceBillItem.findMany({
        where: { invoiceId: BigInt(invoiceId) },
        take: limit,
        skip: offset,
    })
}

async function confirmAndCreateInvoice(user, data, sendEmail = false) {
    // console.log('Invoice data before processing:', data);
    const isDraft = data.status === 'DRAFT';

    // console.log('Is draft:', isDraft);
    const invoiceId = data.id;
    // 1️⃣ Calculate totals safely
    const subtotal = data.items.reduce(
        (s, i) => s + (i.quantity ?? 1) * (i.unitPrice ?? 0),
        0
    );

    const taxAmount = data.items.reduce(
        (s, i) =>
            s +
            ((i.quantity ?? 1) *
                (i.unitPrice ?? 0) *
                (i.taxRate ?? 0)) /
            100,
        0
    );
    const effectiveTax = subtotal ? Number(((taxAmount / subtotal) * 100).toFixed(2)) : 0;

    const discount = data.discount ?? 0;
    const shippingCost = data.shippingCost ?? 0;

    const totalAmount =
        subtotal - discount + taxAmount + shippingCost;

    const paidAmount = data.paidAmount ?? 0;
    const balanceDue = totalAmount - paidAmount;

    const exchangeRate = data.exchangeRate ?? 1;
    const baseAmount = totalAmount * exchangeRate;

    if (invoiceId) {
        const existing = await prisma.invoiceBill.findFirst({
            where: {
                id: BigInt(invoiceId),
                orgId: BigInt(user.orgId),
            },
        });
        // console.log('Existing invoice:', existing);
        if (!existing) {
            throw new Error("Invoice not found");
        }

        const updated = await prisma.invoiceBill.update({
            where: { id: BigInt(invoiceId) },
            data: {
                // Amounts
                subtotal,
                discount,
                taxAmount,
                shippingCost,
                totalAmount,
                paidAmount,
                balanceDue,
                effectiveTax,

                // Status logic
                status: data.status,
                pdfStatus:
                    !isDraft && existing.pdfStatus === "NOT_STARTED"
                        ? "QUEUED"
                        : existing.pdfStatus,

                confirmedAt: !isDraft && !existing.confirmedAt
                    ? new Date()
                    : existing.confirmedAt,

                sentAt: !isDraft && !existing.sentAt
                    ? new Date()
                    : existing.sentAt,

                // Update everything else as usual
                notes: data.notes,
                paymentTerms: data.paymentTerms,
                taxSummary: data.taxSummary,
                bankDetails: data.bankDetails,

                // Replace items safely
                items: {
                    deleteMany: {},
                    create: (data.items ?? []).map((item) => ({
                        itemName: item.name,
                        description: item.description,
                        quantity: item.quantity ?? 1,
                        unitType: item.unitType ?? "UNIT",
                        unitPrice: item.unitPrice ?? 0,
                        taxRate: item.taxRate ?? 0,
                        // totalPrice:
                        //     (item.quantity ?? 1) *
                        //     (item.unitPrice ?? 0) +
                        //     ((item.quantity ?? 1) *
                        //         (item.unitPrice ?? 0) *
                        //         (item.taxRate ?? 0)) / 100,
                        "totalPrice": item.itemTotal ?? 0,
                    })),
                },
            },
            include: {
                items: true,
                customFields: {
                    include: {
                        customField: true,
                    },
                },
            },
        });

        if (data.customFields !== undefined) {
            await prisma.invoiceCustomFieldValue.deleteMany({
                where: { invoiceId: BigInt(invoiceId) },
            });
            await saveInvoiceCustomFields(prisma, user.orgId, updated.id, data.customFields);
            return prisma.invoiceBill.findFirstOrThrow({
                where: { id: BigInt(invoiceId) },
                include: {
                    items: true,
                    customFields: {
                        include: {
                            customField: true,
                        },
                    },
                },
            });
        }

        // 3️⃣ Queue PDF only once
        if (!isDraft && existing.pdfStatus === "NOT_STARTED") {
            try {
                await qstashService.publishInvoicePdfJob({
                    invoiceId: updated.id,
                    sendEmail,
                });
            } catch (err) {
                console.error("QStash publish failed (update path):", err);

                await prisma.invoiceBill.update({
                    where: { id: BigInt(invoiceId) },
                    data: { pdfStatus: "DRAFT" },
                });
            }
        }
        console.log('Data after Processing:', updated.id);
        return updated;
    }

    // 2️⃣ Create CONFIRMED + SENT invoice
    const invoice = await prisma.invoiceBill.create({
        data: {
            // 🔑 Core relations
            orgId: BigInt(user.orgId),
            customerId: BigInt(user.userId),
            clientId: data.clientId ? BigInt(data.clientId) : null,

            // 📄 Invoice identity
            invoiceNumber:
                data.invoiceNumber ??
                `INV-${user.userId}-${(
                    Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
                ).toUpperCase()}`,
            invoiceType: data.invoiceType ?? "TAX",

            issueDate: data.issueDate ? new Date(data.issueDate) : new Date(),
            dueDate: data.dueDate ? new Date(data.dueDate) : new Date(),
            paymentTerms: data.paymentTerms ?? "Due on receipt",

            // 💱 Currency
            currency: data.currency ?? "USD",
            exchangeRate,
            baseCurrency: data.baseCurrency ?? "INR",
            baseAmount,

            // 💰 Amounts
            subtotal,
            discount,
            taxAmount,
            shippingCost,
            totalAmount,
            paidAmount,
            balanceDue,
            effectiveTax,

            // 📌 Status
            status: data.status ?? "DRAFT",
            confirmedAt: new Date(),
            sentAt: new Date(),
            pdfStatus: "NOT_STARTED",
            category: data.category ?? "OTHER",

            // 🧾 Seller snapshot
            sellerName: data.seller?.name,
            sellerEmail: data.seller?.email,
            sellerPhone: data.seller?.phone,
            sellerStreetAddress: data.seller?.streetAddress,
            sellerCity: data.seller?.city,
            sellerState: data.seller?.state,
            sellerZipCode: data.seller?.zipCode,
            sellerCountry: data.seller?.country,
            sellerTaxId: data.seller?.taxId,
            sellerTaxSystem: data.seller?.taxSystem,
            iecCode: data.seller?.iecCode,
            lutFiled: data.seller?.lutFiled ?? false,

            // 🧮 Tax & compliance
            taxType: data.taxType ?? "NONE",
            placeOfSupply: data.placeOfSupply,
            reverseCharge: data.reverseCharge ?? false,
            reverseReason: data.reverseReason,
            sacCode: data.sacCode,
            taxSummary: data.taxSummary,

            // 🚚 Shipping / trade
            shipToName: data.shipTo?.name,
            shipToAddress: data.shipTo?.address,
            countryOfOrigin: data.countryOfOrigin,
            countryOfDestination: data.countryOfDestination,
            incoterms: data.incoterms,

            // 💳 Payment
            bankDetails: data.bankDetails,
            paymentLink: data.paymentLink,
            bankAddress: data.bankAddress,

            // ⚖️ Legal
            jurisdiction: data.jurisdiction,
            lateFeePolicy: data.lateFeePolicy,
            notes: data.notes,

            // 📦 Items (EXPLICIT mapping)
            items: {
                create: data.items.map((item) => ({
                    itemName: item.name,
                    description: item.description,
                    quantity: item.quantity ?? 1,
                    unitType: item.unitType ?? "UNIT",
                    unitPrice: item.unitPrice ?? 0,
                    taxRate: item.taxRate ?? 0,
                    // totalPrice:
                    //     (item.quantity ?? 1) *
                    //     (item.unitPrice ?? 0) +
                    //     ((item.quantity ?? 1) *
                    //         (item.unitPrice ?? 0) *
                    //         (item.taxRate ?? 0)) /
                    //     100,
                    "totalPrice": item.itemTotal ?? 0,
                })),
            },
        },
        include: {
            items: true,
            customFields: {
                include: {
                    customField: true,
                },
            },
        },
    });

    await saveInvoiceCustomFields(prisma, user.orgId, invoice.id, data.customFields);
    // console.log('Created invoice with ID:', invoice.id);

    // 3️⃣ Queue PDF generation
    // await invoiceQueue.enqueue({ invoiceId: invoice.id });

    // 3️⃣ Trigger PDF generation (async, reliable)
    // await qstashService.publishInvoicePdfJob({
    //     invoiceId: invoice.id,
    // });
    if (!isDraft) {
        try {
           const queueResponse =  await qstashService.publishInvoicePdfJob({
                invoiceId: invoice.id,
                sendEmail
            });
            console.log('QStash publish log:', queueResponse);
            return await prisma.invoiceBill.update({
                where: { id: invoice.id },
                data: { pdfStatus: "QUEUED" },
                include: {
                    items: true,
                    customFields: {
                        include: {
                            customField: true,
                        },
                    },
                }
            });

        } catch (err) {
            console.error("QStash publish failed:", err);

            // ❌ Mark FAILED
            // return await prisma.invoiceBill.update({
            //     where: { id: invoice.id },
            //     data: { pdfStatus: "NOT_STARTED" },
            //     include: { items: true }
            // });
        }
    }
    // console.log('Data after Processing:', invoice);

    return prisma.invoiceBill.findFirstOrThrow({
        where: { id: invoice.id },
        include: {
            items: true,
            customFields: {
                include: {
                    customField: true,
                },
            },
        },
    });
}

async function updateInvoice(user, id, data) {
    return await prisma.$transaction(async (tx) => {
        const invoiceId = BigInt(id);

        // --------------------------------------------------
        // 1️⃣ Fetch Existing Invoice
        // --------------------------------------------------
        const existingInvoice = await tx.invoiceBill.findFirst({
            where: {
                id: invoiceId,
                orgId: BigInt(user.orgId),
            },
            include: { items: true },
        });

        if (!existingInvoice) {
            throw new Error("Invoice not found");
        }

        const updateData = {};

        // --------------------------------------------------
        // 2️⃣ Handle Client (Buyer) Logic
        // --------------------------------------------------

        if (data.buyer) {
            let clientId = existingInvoice.clientId;

            if (clientId) {
                // Update existing client
                await tx.client.update({
                    where: { id: clientId },
                    data: {
                        name: data.buyer.name,
                        email: data.buyer.email,
                        phone: data.buyer.phone,
                        streetAddress: data.buyer.address?.street,
                        city: data.buyer.address?.city,
                        state: data.buyer.address?.state,
                        zipCode: data.buyer.address?.zipCode,
                        country: data.buyer.address?.country,
                        companyType: data.buyer.companyType,
                        gstin: data.buyer.gstin,
                        taxId: data.buyer.taxId,
                        taxSystem: data.buyer.taxSystem ?? "NONE",
                    },
                });
            } else {
                // Create new client
                const newClient = await tx.client.create({
                    data: {
                        orgId: BigInt(user.orgId),
                        name: data.buyer.name,
                        email: data.buyer.email,
                        phone: data.buyer.phone,
                        streetAddress: data.buyer.address?.street,
                        city: data.buyer.address?.city,
                        state: data.buyer.address?.state,
                        zipCode: data.buyer.address?.zipCode,
                        country: data.buyer.address?.country,
                        companyType: data.buyer.companyType,
                        gstin: data.buyer.gstin,
                        taxId: data.buyer.taxId,
                        taxSystem: data.buyer.taxSystem ?? "NONE",
                        isActive: true,
                    },
                });

                updateData.clientId = newClient.id;
            }
        }

        if (data.clientId !== undefined) {
            updateData.clientId = BigInt(data.clientId);
        }

        // --------------------------------------------------
        // 3️⃣ Map All Direct Invoice Fields
        // --------------------------------------------------

        const directFields = [
            "invoiceNumber",
            "invoiceType",
            "paymentTerms",
            "status",
            "category",
            "currency",
            "baseCurrency",
            "taxType",
            "placeOfSupply",
            "reverseCharge",
            "reverseReason",
            "sacCode",
            "taxSummary",
            "countryOfOrigin",
            "countryOfDestination",
            "incoterms",
            "bankDetails",
            "paymentLink",
            "bankAddress",
            "jurisdiction",
            "lateFeePolicy",
            "notes",
        ];

        directFields.forEach((field) => {
            if (data[field] !== undefined) {
                updateData[field] = data[field];
            }
        });

        if (data.issueDate)
            updateData.issueDate = new Date(data.issueDate);

        if (data.dueDate)
            updateData.dueDate = new Date(data.dueDate);

        // --------------------------------------------------
        // 4️⃣ Seller Snapshot Fields
        // --------------------------------------------------

        if (data.seller) {
            const sellerMap = {
                name: "sellerName",
                email: "sellerEmail",
                phone: "sellerPhone",
                streetAddress: "sellerStreetAddress",
                city: "sellerCity",
                state: "sellerState",
                zipCode: "sellerZipCode",
                country: "sellerCountry",
                taxId: "sellerTaxId",
                iecCode: "iecCode",
                lutFiled: "lutFiled",
            };

            Object.entries(sellerMap).forEach(([inputKey, dbKey]) => {
                if (data.seller[inputKey] !== undefined) {
                    updateData[dbKey] = data.seller[inputKey];
                }
            });
        }

        // --------------------------------------------------
        // 5️⃣ Shipping Fields
        // --------------------------------------------------

        if (data.shipTo) {
            if (data.shipTo.name !== undefined)
                updateData.shipToName = data.shipTo.name;

            if (data.shipTo.address !== undefined)
                updateData.shipToAddress = data.shipTo.address;
        }

        // --------------------------------------------------
        // 6️⃣ Handle Items
        // --------------------------------------------------

        let items = existingInvoice.items;

        if (Array.isArray(data.items)) {
            items = data.items;

            updateData.items = {
                deleteMany: {},
                create: data.items.map((item) => ({
                    itemName: item.name,
                    description: item.description,
                    quantity: item.quantity ?? 1,
                    unitType: item.unitType ?? "UNIT",
                    unitPrice: item.unitPrice ?? 0,
                    taxRate: item.taxRate ?? 0,
                    totalPrice:
                        item.itemTotal ??
                        (item.quantity ?? 1) * (item.unitPrice ?? 0),
                })),
            };
        }

        // --------------------------------------------------
        // 7️⃣ Smart Recalculation
        // --------------------------------------------------

        const shouldRecalculate =
            data.items ||
            data.discount !== undefined ||
            data.shippingCost !== undefined ||
            data.paidAmount !== undefined ||
            data.exchangeRate !== undefined;

        if (shouldRecalculate) {
            const subtotal = items.reduce(
                (sum, i) => sum + (i.quantity ?? 1) * (i.unitPrice ?? 0),
                0
            );

            const taxAmount = items.reduce(
                (sum, i) =>
                    sum +
                    ((i.quantity ?? 1) *
                        (i.unitPrice ?? 0) *
                        (i.taxRate ?? 0)) /
                    100,
                0
            );

            const discount =
                data.discount ?? existingInvoice.discount ?? 0;

            const shippingCost =
                data.shippingCost ??
                existingInvoice.shippingCost ??
                0;

            const paidAmount =
                data.paidAmount ??
                existingInvoice.paidAmount ??
                0;

            const exchangeRate =
                data.exchangeRate ??
                existingInvoice.exchangeRate ??
                1;

            const totalAmount =
                subtotal - discount + taxAmount + shippingCost;

            const balanceDue = totalAmount - paidAmount;
            const baseAmount = totalAmount * exchangeRate;

            Object.assign(updateData, {
                subtotal,
                taxAmount,
                discount,
                shippingCost,
                totalAmount,
                paidAmount,
                balanceDue,
                exchangeRate,
                baseAmount,
            });
        }

        updateData.updatedAt = new Date();

        // --------------------------------------------------
        // 8️⃣ Final Update
        // --------------------------------------------------

        const updatedInvoice = await tx.invoiceBill.update({
            where: { id: invoiceId },
            data: updateData,
            include: {
                items: true,
                customFields: {
                    include: {
                        customField: true,
                    },
                },
            },
        });

        if (data.customFields !== undefined) {
            await tx.invoiceCustomFieldValue.deleteMany({
                where: { invoiceId },
            });
            await saveInvoiceCustomFields(tx, user.orgId, invoiceId, data.customFields);
        }

        if (data.customFields !== undefined) {
            return tx.invoiceBill.findFirstOrThrow({
                where: { id: invoiceId },
                include: {
                    items: true,
                    customFields: {
                        include: {
                            customField: true,
                        },
                    },
                },
            });
        }

        return updatedInvoice;
    });
}

async function getInvoice(user, id) {
    const invoice = await prisma.invoiceBill.findFirstOrThrow({
        where: { id: BigInt(id), orgId: user.orgId },
        include: {
            items: true,
            customFields: {
                include: {
                    customField: true,
                },
            },
        }
    });
    await markOverdueInvoices(invoice);
    return {
        ...invoice,
        customFields: (invoice.customFields ?? []).map(cf => ({
            name: cf.customField.name,
            value: cf.value
        }))
    };
};

async function getSignedPdfUrl(user, id) {
    const invoice = await prisma.invoiceBill.findFirst({
        where: {
            id: BigInt(id),
            orgId: user.orgId
        }
    });

    if (!invoice) {
        return {
            success: false,
            status: 'INVOICE_NOT_FOUND',
            message: 'Invoice not found'
        };
    }

    if (invoice.pdfStatus === 'NOT_STARTED') {
        return {
            success: false,
            status: 'NOT_STARTED',
            message: 'PDF generation not started yet'
        };
    }

    if (invoice.pdfStatus === 'QUEUED') {
        return {
            success: false,
            status: 'QUEUED',
            message: 'PDF is queued for processing'
        };
    }

    if (invoice.pdfStatus === 'PROCESSING') {
        return {
            success: false,
            status: 'PROCESSING',
            message: 'PDF is currently being generated'
        };
    }

    if (invoice.pdfStatus === 'FAILED') {
        return {
            success: false,
            status: 'FAILED',
            message: 'PDF generation failed'
        };
    }

    if (!invoice.pdfKey) {
        return {
            success: false,
            status: 'NOT_GENERATED',
            message: 'PDF not generated'
        };
    }

    const storage = require('../../storage/storage.service');
    const url = await storage.getSignedUrl(invoice.pdfKey);
    return {
        success: true,
        status: 'READY',
        url
    };
}

const clients = new Map();
// key: `${userId}:${invoiceId}` → res

async function openStream({ req, res, userId, invoiceId }) {
    const key = `${userId}:${invoiceId}`;

    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });
    //Calling res.flushHeaders() initiates the response but does not signal the end of the data transfer. You can continue to use res.write() to send data chunks. The connection stays open until res.end() is called.
    res.flushHeaders();

    clients.set(key, res);

    req.on('close', () => {
        clients.delete(key);
    });
};

async function pushPdfReady({ userId, invoiceId, signedUrl }) {
    const key = `${userId}:${invoiceId}`;
    const client = clients.get(key);

    if (!client) return;

    client.write(`event: pdf-ready\n`);
    client.write(
        `data: ${JSON.stringify({ status: 'READY', signedUrl })}\n\n`
    );

    client.end();
    clients.delete(key);
};

async function deleteInvoice(user, id) {
    const invoice = await prisma.invoiceBill.findFirst({
        where: { id: BigInt(id), orgId: user.orgId }
    });

    if (!invoice) {
        throw new Error('Invoice not found');
    }

    if (invoice.pdfKey) {
        try {
            await storage.remove(invoice.pdfKey);
        } catch (err) {
            console.error("Failed to delete file:", err.message);
        }
    }

    // Delete invoice items first (due to foreign key constraint)
    await prisma.invoiceBillItem.deleteMany({
        where: { invoiceId: BigInt(id) }
    });

    // Delete the invoice
    const deletedInvoice = await prisma.invoiceBill.delete({
        where: { id: BigInt(id) }
    });

    return {
        success: true,
        message: 'Invoice deleted successfully',
        id: deletedInvoice.id
    };
}

async function exportInvoices(
    user,
    startDate,
    endDate,
    format,
    includeItems
) {
    const where = {
        orgId: BigInt(user.orgId),
    };

    if (startDate || endDate) {
        where.issueDate = {};

        if (startDate) {
            where.issueDate.gte = new Date(startDate);
        }

        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            where.issueDate.lte = end;
        }
    }
    const invoices = await prisma.invoiceBill.findMany({
        where,
        include: {
            items: includeItems,
        },
        orderBy: {
            createdAt: "desc",
        },
    });

    let rows = [];

    invoices.forEach(inv => {

        const baseData = {
            invoiceId: inv.id.toString(),
            invoiceNumber: inv.invoiceNumber,
            issueDate: inv.issueDate,
            dueDate: inv.dueDate,
            status: inv.status,
            category: inv.category,

            currency: inv.currency,
            totalAmount: inv.totalAmount,
            taxAmount: inv.taxAmount,
            discount: inv.discount,
            shippingCost: inv.shippingCost,

            paidAmount: inv.paidAmount,
            balanceDue: inv.balanceDue,

            sellerName: inv.sellerName,
            sellerEmail: inv.sellerEmail,

            placeOfSupply: inv.placeOfSupply,
            taxType: inv.taxType,
        };

        // WITH ITEMS (flattened)
        if (includeItems && inv.items?.length) {

            inv.items.forEach(item => {
                rows.push({
                    ...baseData,

                    itemName: item.itemName,
                    description: item.description,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    taxRate: item.taxRate,
                    totalPrice: item.totalPrice,
                    unitType: item.unitType,
                });
            });

        } else {
            // WITHOUT ITEMS
            rows.push(baseData);
        }
    });
    if (format === "csv") {
        const parser = new Parser();
        return parser.parse(rows);
    }
    if (format === "excel") {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Invoices");

        const headers = Object.keys(rows[0] || {});

        sheet.columns = headers.map(h => ({
            header: h,
            key: h,
            width: 20,
        }));

        rows.forEach(r => sheet.addRow(r));

        return await workbook.xlsx.writeBuffer();
    }

    throw new Error("Invalid format");
};

module.exports = {
    saveInvoiceFromPreview,
    listInvoices,
    listInvoiceProducts,
    previewInvoiceAI,
    confirmAndCreateInvoice,
    getInvoice,
    getSignedPdfUrl,
    openStream,
    pushPdfReady,
    updateInvoice,
    deleteInvoice,
    exportInvoices
};
