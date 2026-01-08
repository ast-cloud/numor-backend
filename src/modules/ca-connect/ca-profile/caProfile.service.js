const prisma = require('../../../config/database');

exports.listApprovedCAs = async () => {
  return prisma.cAProfile.findMany({
    where: { status: 'APPROVED' },
    select: {
      id: true,
      experienceYears: true,
      hourlyFee: true,
      ratingAvg: true,
      ratingCount: true,
      specializations: true,
      languages: true,
      user: {
        select: {
          name: true
        }
      }
    }
  });
};

exports.getByUserId = async (user) => {
  return prisma.cAProfile.findUnique({
    where: { userId: user.userId }
  });
};

exports.createProfile = async (user, data) => {
  const existing = await prisma.cAProfile.findUnique({
    where: { userId: user.userId }
  });

  if (existing) {
    throw new Error('CA profile already exists');
  }

  return prisma.cAProfile.create({
    data: {
      ...data,
      userId: user.userId,
      status: 'PENDING'
    }
  });
};

exports.updateProfile = async (user, data) => {
  const existing = await prisma.cAProfile.findUnique({
    where: { userId: user.userId }
  });

  if (!existing) {
    throw new Error('CA profile not found');
  }

  return prisma.cAProfile.update({
    where: { userId: user.userId },
    data
  });
};

exports.deleteProfile = async (user) => {
  const existing = await prisma.cAProfile.findUnique({
    where: { userId: user.userId }
  });

  if (!existing) {
    throw new Error('CA profile not found');
  }

  return prisma.cAProfile.delete({
    where: { userId: user.userId }
  });
};
