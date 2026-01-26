const prisma = require('../../../config/database');
const fetch = require('node-fetch');
const buildBaseContext = require('./chatBot.base.context');
const smeContext = require('./chatBot.smeUser.context');
const caContext = require('./chatBot.caContext');
const buildPrompt = require('./chatBot.prompt');

const GEMINI_ENDPOINT =
    'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent';


/*
User Identity (baseContext)
        ↓
Role Context (SME / CA)
        ↓
Intent Data (invoices, bookings, KPIs)
        ↓
Prompt
 */
function detectIntent(message) {
    const text = message.toLowerCase();

    if (text.includes("invoice")) return "INVOICE_QUERY";
    if (text.includes("expense")) return "EXPENSE_QUERY";
    if (text.includes("profit") || text.includes("cashflow")) return "KPI_QUERY";
    if (text.includes("booking") || text.includes("appointment")) return "BOOKING_QUERY";
    if (text.includes("tax")) return "TAX_QUERY";
    if (text.includes("summary")) return "SUMMARY_QUERY";

    return "GENERAL_QUERY";
}

const intentHandlers = {
    INVOICE_QUERY: async (ctx) => {
        if (ctx.role !== 'SME_USER') return [];
        return prisma.invoiceBill.findMany({
            where: { customerId: ctx.userId },
            orderBy: { issueDate: 'desc' },
            take: 5
        });
    },

    BOOKING_QUERY: async (ctx) => {
        return prisma.cABooking.findMany({
            where: { userId: ctx.userId },
            include: { caProfile: true }
        });
    },

    GENERAL_QUERY: async () => ({})
};

async function resolveUserContext(userId) {
    const user = await prisma.user.findUnique({
        where: { id: BigInt(userId) },
        include: { organization: true, caProfile: true }
    });

    if (!user) throw new Error("User not found");

    return {
        userId: user.id,
        role: user.role,
        orgId: user.orgId,
        user
    };
}

function safeJson(data) {
    return JSON.stringify(data, (_, v) =>
        typeof v === 'bigint' ? v.toString() : v
        , 2);
}

async function callGemini(prompt) {
    const response = await fetch(
        `${GEMINI_ENDPOINT}?key=${process.env.GEMINI_API_KEY}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{
                    role: "user",
                    parts: [{ text: prompt }]
                }]
            })
        }
    );

    if (!response.ok) {
        throw new Error(await response.text());
    }

    const data = await response.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text;
}

async function handleChat(user, message) {
    const ctx = await resolveUserContext(user.userId);

    const baseContext = buildBaseContext(ctx.user);
    const roleContext =
        ctx.role === 'SME_USER'
            ? await smeContext(ctx.user)
            : ctx.role === 'CA_USER'
                ? await caContext(ctx.user)
                : {};

    const intent = detectIntent(message);
    const data = intentHandlers[intent]
        ? await intentHandlers[intent](ctx)
        : {};

    const prompt = buildPrompt({
        baseContext,
        roleContext,
        data: safeJson(data),
        message
    });

    return callGemini(prompt);
}

module.exports = { handleChat };
