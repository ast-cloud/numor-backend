const { z } = require('zod');

exports.registerSchema = z.object({
  user: z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6),
    phone: z.string().optional(),
    role: z.enum(['SME_USER', 'ADMIN', 'CA_USER']).optional()
  })
});
