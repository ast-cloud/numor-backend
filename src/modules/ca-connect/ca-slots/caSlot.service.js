const prisma = require('../../../config/database');
const dayjs = require('dayjs');
const isSameOrBefore = require('dayjs/plugin/isSameOrBefore');


exports.createSlots = async (user, payload) => {
    const { date, startTime, endTime, slotDuration, buffer } = payload;
    const caProfile = await prisma.cAProfile.findUnique({
        where: { userId: user.userId }
    });
    console.log('user', user);
    console.log('caProfileId', caProfile.id);
    const slots = [];

    let current = dayjs(`${date} ${startTime}`);
    const end = dayjs(`${date} ${endTime}`);

    while (current.isBefore(end)) {
        const slotEnd = current.add(slotDuration, 'minute');

        if (slotEnd.isAfter(end)) break;

        slots.push({
            caProfileId: caProfile.id,
            date: dayjs(date).startOf('day').toDate(),
            startTime: current.toDate(),
            endTime: slotEnd.toDate()
        });

        current = slotEnd.add(buffer, "minute");
        if (current.isSameOrAfter(end)) break;
    }
    // console.log(slots.map(s =>
    //     `${dayjs(s.startTime).format('HH:mm')} - ${dayjs(s.endTime).format('HH:mm')}`
    // ));


    return prisma.cASlot.createMany({
        data: slots,
        skipDuplicates: true
    });
};

exports.getSlots = async (caProfileId, date) => {
    return prisma.cASlot.findMany({
        where: {
            caProfileId: BigInt(caProfileId),
            date: dayjs(date).startOf('day').toDate()
        },
        orderBy: { startTime: 'asc' }
    });
};

exports.blockSlot = async (slotId, caProfileId) => {
    const slot = await prisma.cASlot.findFirst({
        where: {
            id: BigInt(slotId),
            caProfileId,
            status: 'AVAILABLE'
        }
    });

    if (!slot) throw new Error('Slot not available');

    await prisma.cASlot.update({
        where: { id: BigInt(slotId) },
        data: { status: 'BOOKED' }
    });
};
