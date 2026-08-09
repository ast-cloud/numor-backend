const prisma = require('../../../config/database');
const dayjs = require('dayjs');
const customParseFormat = require("dayjs/plugin/customParseFormat");
const { google } = require("googleapis");
const { ca } = require('zod/v4/locales');
const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = require("../../../config/env");

exports.createOrUpdateSlots = async (user, payload) => {
    const caProfile = await prisma.cAProfile.findUnique({
        where: { userId: user.userId }
    });

    if (!caProfile) {
        throw new Error("CA profile not found");
    }
    if (caProfile.status !== 'APPROVED') {
        throw new Error("CA profile is not approved");
    }

    const allSlots = [];

    for (const [day, daySlots] of Object.entries(payload)) {

        for (const slot of daySlots) {
            const { startTime, endTime, duration, buffer, typeOfCall } = slot;
            // dayjs cannot properly work with time-only values like "10:00" so we make dummy date "2000-01-01" and append time to it and later ignore date part when saving to DB
            let current = dayjs(`2000-01-01 ${startTime}`);
            const end = dayjs(`2000-01-01 ${endTime}`);

            // ✅ validation
            if (!current.isBefore(end)) {
                throw new Error(`Invalid time range for ${day}`);
            }

            while (current.isBefore(end)) {
                const slotEnd = current.add(duration, "minute");

                if (slotEnd.isAfter(end)) break;

                allSlots.push({
                    caProfileId: caProfile.id,
                    day: day.toUpperCase(),
                    typeOfCall: typeOfCall || "BOTH",
                    startTime: current.format("HH:mm"),
                    endTime: slotEnd.format("HH:mm"),
                });

                current = slotEnd.add(buffer, "minute");
            }
        }
    }

    const [deletedSlots, createdSlots] = await prisma.$transaction([
        prisma.cASlot.deleteMany({
            where: { caProfileId: caProfile.id }
        }),
        prisma.cASlot.createMany({
            data: allSlots
        })
    ]);

    return {
        deletedCount: deletedSlots.count,
        createdCount: createdSlots.count
    };
};
const dayOrder = {
    MONDAY: 1,
    TUESDAY: 2,
    WEDNESDAY: 3,
    THURSDAY: 4,
    FRIDAY: 5,
    SATURDAY: 6,
    SUNDAY: 7
};

exports.resolveCaProfileIdForSlots = async (user, requestedCaProfileId) => {
    if (requestedCaProfileId) {
        return requestedCaProfileId;
    }

    if (user?.role !== "CA_USER") {
        throw new Error("caProfileId is required");
    }

    const caProfile = await prisma.cAProfile.findUnique({
        where: { userId: BigInt(user.userId) },
        select: { id: true }
    });

    if (!caProfile) {
        throw new Error("CA profile not found");
    }

    return caProfile.id.toString();
};

const toDateTime = (dateKey, time) => new Date(`${dateKey}T${time}:00`);

const hasTimeOverlap = (slotStart, slotEnd, eventStart, eventEnd) =>
    slotStart < eventEnd && slotEnd > eventStart;

const fetchGoogleCalendarEvents = async (caProfile, start, end) => {
    if (!caProfile?.googleCalendarConnected) {
        return [];
    }

    if (!caProfile.googleAccessToken && !caProfile.googleRefreshToken) {
        return [];
    }

    const oauth2Client = new google.auth.OAuth2(
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
        access_token: caProfile.googleAccessToken || undefined,
        refresh_token: caProfile.googleRefreshToken || undefined,
        expiry_date: caProfile.googleTokenExpiry
            ? new Date(caProfile.googleTokenExpiry).getTime()
            : undefined
    });

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    const events = [];
    let pageToken;

    try {
        do {
            const response = await calendar.events.list({
                calendarId: "primary",
                timeMin: start.startOf("day").toDate().toISOString(),
                timeMax: end.endOf("day").toDate().toISOString(),
                singleEvents: true,
                orderBy: "startTime",
                maxResults: 2500,
                pageToken
            });

            events.push(...(response.data.items || []));
            pageToken = response.data.nextPageToken;
        } while (pageToken);
    } catch (error) {
        console.error("Google Calendar fetch failed:", error?.message || error);
        return [];
    }

    const refreshed = oauth2Client.credentials || {};
    if (
        refreshed.access_token &&
        refreshed.access_token !== caProfile.googleAccessToken
    ) {
        await prisma.cAProfile.update({
            where: { id: caProfile.id },
            data: {
                googleAccessToken: refreshed.access_token,
                googleTokenExpiry: refreshed.expiry_date
                    ? new Date(refreshed.expiry_date)
                    : caProfile.googleTokenExpiry
            }
        });
    }
    return events
        .map((event) => {
            const startValue = event?.start?.dateTime || event?.start?.date;
            const endValue = event?.end?.dateTime || event?.end?.date;

            if (!startValue || !endValue) {
                return null;
            }

            const eventStart = new Date(startValue);
            const eventEnd = new Date(endValue);

            if (Number.isNaN(eventStart.getTime()) || Number.isNaN(eventEnd.getTime())) {
                return null;
            }

            return { start: eventStart, end: eventEnd };
        })
        .filter(Boolean);
};

exports.getWeeklyAvailableSlots = async (caProfileId, startDate, endDate) => {

    const start = dayjs(startDate, "YYYY-MM-DD", true);
    const end = dayjs(endDate, "YYYY-MM-DD", true);

    if (!start.isValid() || !end.isValid()) {
        throw new Error("Invalid date format. Expected YYYY-MM-DD");
    }

    const result = {};
    const caId = BigInt(caProfileId);

    const [allSlots, bookings, caProfile] = await Promise.all([
        prisma.cASlot.findMany({
            where: { caProfileId: caId }
        }),
        prisma.cABooking.findMany({
            where: {
                caProfileId: caId,
                bookingDate: {
                    gte: new Date(start.format("YYYY-MM-DD")),
                    lte: new Date(end.format("YYYY-MM-DD"))
                },
                OR: [
                    { status: "CONFIRMED" },
                    {
                        status: "INITIATED",
                        expiresAt: { gt: new Date() }
                    }
                ]
            },
            select: {
                slotId: true,
                bookingDate: true
            }
        }),
        prisma.cAProfile.findUnique({
            where: { id: caId },
            select: {
                id: true,
                googleCalendarConnected: true,
                googleAccessToken: true,
                googleRefreshToken: true,
                googleTokenExpiry: true
            }
        })
    ]);

    if (!caProfile) {
        throw new Error("CA profile not found");
    }

    const googleEvents = await fetchGoogleCalendarEvents(caProfile, start, end);

    const bookingMap = {};

    for (const booking of bookings) {
        const dateKey = dayjs(booking.bookingDate).format("YYYY-MM-DD");
        if (!bookingMap[dateKey]) {
            bookingMap[dateKey] = new Set();
        }

        bookingMap[dateKey].add(booking.slotId.toString());
    }

    let current = start.clone();
    while (current.isBefore(end) || current.isSame(end)) {

        const dateKey = current.format("YYYY-MM-DD");

        const formattedKey = `${current.format("dddd").toUpperCase()} ${current.format("DD-MM-YYYY")}`;

        const day = current.format("dddd").toUpperCase();

        const slotsForDay = allSlots.filter(s => s.day === day);

        const blockedIds = bookingMap[dateKey] || new Set();

        const availableSlots = slotsForDay
            .filter(slot => !blockedIds.has(slot.id.toString()))
            .filter((slot) => {
                const slotStart = toDateTime(dateKey, slot.startTime);
                const slotEnd = toDateTime(dateKey, slot.endTime);

                return !googleEvents.some((event) =>
                    hasTimeOverlap(slotStart, slotEnd, event.start, event.end)
                );
            })
            .sort((a, b) => a.startTime.localeCompare(b.startTime))
            .map(slot => ({
                id: slot.id,
                startTime: slot.startTime,
                endTime: slot.endTime,
                typeOfCall: slot.typeOfCall
            }));

        result[formattedKey] = availableSlots;

        current = current.add(1, "day");
    }

    return result;
};
dayjs.extend(customParseFormat);
exports.createBooking = async (user, payload) => {
    const { caProfileId, slotId, bookingDate, consultationMode } = payload;

    const expiryMinutes = 5;
    const parsedDate = dayjs(bookingDate, "DD-MM-YYYY", true);

    if (!parsedDate.isValid()) {
        throw new Error("Invalid bookingDate format. Expected DD-MM-YYYY");
    }

    if (parsedDate.isBefore(dayjs(), "day")) {
        throw new Error("Cannot book past dates");
    }

    const normalizedDateObj = new Date(parsedDate.format("YYYY-MM-DD"));
    return await prisma.$transaction(async (tx) => {

        const slot = await tx.cASlot.findUnique({
            where: { id: BigInt(slotId) }
        });

        if (!slot) {
            throw new Error("Slot not found");
        }

        const caProfile = await tx.cAProfile.findUnique({
            where: { id: BigInt(caProfileId) }
        });

        if (!caProfile) {
            throw new Error("CA profile not found");
        }

        // Clean expired holds
        await tx.cABooking.updateMany({
            where: {
                slotId: BigInt(slotId),
                bookingDate: normalizedDateObj,
                status: "INITIATED",
                expiresAt: { lt: new Date() }
            },
            data: { status: "EXPIRED" }
        });

        const existingBooking = await tx.cABooking.findFirst({
            where: {
                slotId: BigInt(slotId),
                bookingDate: normalizedDateObj,
                OR: [
                    { status: "CONFIRMED" },
                    {
                        status: "INITIATED",
                        expiresAt: { gt: new Date() }
                    }
                ]
            }
        });

        if (existingBooking) {
            throw new Error("Slot already booked or temporarily blocked");
        }

        const start = dayjs(`2000-01-01 ${slot.startTime}`);
        const end = dayjs(`2000-01-01 ${slot.endTime}`);
        const durationMinutes = end.diff(start, "minute");

        if (durationMinutes <= 0) {
            throw new Error("Invalid slot duration");
        }

        const baseAmount = (caProfile.hourlyFee / 60) * durationMinutes;
        const taxPercent = caProfile.taxPercent || 0;
        const amount = Number(baseAmount.toFixed(2));

        try {
            const booking = await tx.cABooking.create({
                data: {
                    bookingCode: `BOOK-${crypto.randomUUID()}`,
                    userId: BigInt(user.userId),
                    caProfileId: BigInt(caProfileId),
                    slotId: BigInt(slotId),
                    bookingDate: normalizedDateObj,
                    startTime: slot.startTime,
                    endTime: slot.endTime,
                    consultationMode,
                    durationMinutes,
                    amount,
                    taxPercent,
                    status: "INITIATED",
                    expiresAt: dayjs().add(expiryMinutes, "minute").toDate()
                }
            });

            return booking;
        } catch (error) {
            if (error.code === "P2002") {
                throw new Error("Slot already booked");
            }
            throw error;
        }
    });
};

exports.listCABookings = async (CA) => {
    const caProfile = await prisma.cAProfile.findUnique({
        where: { userId: CA.userId }
    });

    if (!caProfile) {
        throw new Error('CA profile not found');
    }

    return prisma.cABooking.findMany({
        where: { caProfileId: caProfile.id },
        orderBy: { bookingDate: 'desc' },
        include: {
            user: {
                select: { id: true, name: true, email: true }
            },
            payment: true,
            review: true
        }
    });
};

exports.listUserBookings = async (user) => {
    return prisma.cABooking.findMany({
        where: { userId: user.userId },
        orderBy: { bookingDate: 'desc' },
        include: {
            caProfile: {
                select: {
                    id: true,
                    hourlyFee: true,
                    user: {
                        select: { name: true }
                    }
                }
            },
            payment: true,
            review: true
        }
    });
};

exports.getByBookingCode = async (bookingCode, user) => {
    const booking = await prisma.cABooking.findUnique({
        where: { bookingCode },
        include: {
            caProfile: {
                include: {
                    user: {
                        select: { id: true, name: true, email: true }
                    }
                }
            },
            user: {
                select: { id: true, name: true, email: true }
            },
            payment: true,
            review: true
        }
    });

    if (!booking) {
        throw new Error('Booking not found');
    }
    return booking;
};

