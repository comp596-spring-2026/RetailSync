import { z } from 'zod';
import { moduleKeys } from '../constants/modules';
export const permissionSetSchema = z.object({
    view: z.boolean(),
    create: z.boolean(),
    edit: z.boolean(),
    delete: z.boolean(),
    actions: z.array(z.string())
});
export const permissionsSchema = z.record(z.enum(moduleKeys), permissionSetSchema);
