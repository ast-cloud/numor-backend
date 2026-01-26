const prisma = require('../../../config/database');
const fetch = require('node-fetch');
const buildBaseContext = require('./chatBot.base.context');
const smeContext = require('./chatBot.smeUser.context');
const caContext = require('./chatBot.caUser.Context');
const buildPrompt = require('./chatBot.prompt');

const GEMINI_ENDPOINT =
    'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent';


/*
 * It is responsible for:
 *  - Identifying the user
 *  - Understanding the user's role (SME / CA)
 *  - Detecting user intent from natural language
 *  - Fetching relevant data from DB
 *  - Building a safe, structured AI prompt
 *  - Calling Gemini and returning the response

 * Context builders
 *
 * baseContext   → Identity-level data (who the user is)
 * smeContext    → SME-specific business data (invoices, expenses, KPIs)
 * caContext     → CA-specific professional data (bookings, earnings)
 */

/**
 * Prompt builder
 * Responsible for converting all structured context + data
 * into a single, controlled prompt for Gemini
 */


/**
 * ================================
 * Context Flow Model
 * ================================
 *
 * User Identity (baseContext)
 *        ↓
 * Role-based Context (SME / CA)
 *        ↓
 * Intent-based Data (Invoices, Bookings, KPIs)
 *        ↓
 * Prompt Construction
 *        ↓
 * Gemini Response
 *
 * This layered approach avoids:
 *  - Role leakage
 *  - Data hallucination
 *  - Prompt duplication
 */

/**
 * --------------------------------
 * detectIntent
 * --------------------------------
 * Lightweight intent classifier.
 *
 * Purpose:
 *  - Converts free-text user message into a known intent
 *  - Helps decide which DB queries should be executed
 *
 * Why simple keyword-based?
 *  - Fast
 *  - Predictable
 *  - Easy to audit
 *  - Can be replaced later by ML/NLP model
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


/**
 * --------------------------------
 * intentHandlers
 * --------------------------------
 * Maps detected intent → actual data fetch logic.
 *
 * Each handler:
 *  - Receives resolved user context (ctx)
 *  - Enforces role-based access
 *  - Returns only the data needed for AI response
 */
const intentHandlers = {
    INVOICE_QUERY: async (ctx) => {
        if (!['SME_USER', 'CA_USER'].includes(ctx.role)) return [];
        return prisma.invoiceBill.findMany({
            where: { customerId: ctx.userId },
            orderBy: { issueDate: 'desc' },
            take: 5
        });
    },

    BOOKING_QUERY: async (ctx) => {
        if (ctx.role !== 'CA_USER') return [];
        return prisma.cABooking.findMany({
            where: { userId: ctx.userId },
            include: { caProfile: true }
        });
    },

    GENERAL_QUERY: async () => ({})
};
/**
 * --------------------------------
 * resolveUserContext
 * --------------------------------
 * Resolves the authenticated user into a rich system context.
 *
 * Purpose:
 *  - Fetch full user record
 *  - Attach organization & CA profile
 *  - Normalize identity data for chatbot usage
 *
 * This function is called ONCE per chat request.
 */
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
/**
 * Safely serializes Prisma data for AI prompts.
 *
 * Why needed?
 *  - Prisma uses BigInt & Decimal types
 *  - JSON.stringify crashes on BigInt
 *
 * This ensures:
 *  - No runtime crashes
 *  - AI receives clean, readable data
 */
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
/**
 * --------------------------------
 * handleChat (MAIN ENTRY POINT)
 * -------------------------------- *
 * Flow:
 *  1. Resolve user identity & role
 *  2. Build base context (who the user is)
 *  3. Build role context (SME / CA specific data)
 *  4. Detect intent from message
 *  5. Fetch intent-specific data
 *  6. Build AI prompt
 *  7. Call Gemini
 *  8. Return AI response
 */
async function handleChat(user, message) {
    const ctx = await resolveUserContext(user.userId);

    const baseContext = buildBaseContext(ctx.user);
    const roleContext = {};
    
    // SME data is available to both SME_USER and CA_USER
    if(ctx.role === 'SME_USER' || ctx.role === 'CA_USER') {
        roleContext.sme = await smeContext(ctx.user);
    }
    // CA data only for CA_USER
    if(ctx.role === 'CA_USER') {
        roleContext.ca = await caContext(ctx.user);
    }

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
