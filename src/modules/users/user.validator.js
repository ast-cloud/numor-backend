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
    password: z.string().min(6).max(100).optional(),
    address: z.string().optional(),
    phone: z.string().optional(),
    role: z.string().optional(),
})

exports.updateStatusSchema = z.object({
    isActive: z.boolean()
})