const { UserType } = require('@prisma/client');
const {z} = require('zod');

exports.createUserSchema = z.object({
    email: z.string().email(),
    name: z.string().min(2).max(100),
    UserType: z.enum(['INTERNAL', 'EXTERNAL', 'ADMIN']),
    password: z.string().min(6).max(100),
})

exports.updateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),

  phone: z
    .string()
    .min(8)
    .max(15)
    .optional(),

  address: z
    .string()
    .max(255)
    .optional(),

  password: z
    .string()
    .min(6)
    .max(100)
    .optional(),

  role: z
    .enum(['SME_USER', 'ADMIN', 'CA']) // match Prisma Role enum
    .optional(),

  isActive: z.boolean().optional(),
});

exports.updateStatusSchema = z.object({
    isActive: z.boolean()
})