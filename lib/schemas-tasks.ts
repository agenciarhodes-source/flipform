import { z } from 'zod';

export const taskPriorityEnum = z.enum(['low', 'medium', 'high']);
export const taskStatusEnum = z.enum(['pending', 'completed']);

export const taskCreateSchema = z.object({
  title: z.string().min(1, 'Título obrigatório').max(200, 'Título muito longo'),
  description: z.string().max(2000).optional().nullable(),
  dueDate: z.string().datetime({ offset: true }).optional().nullable(),
  priority: taskPriorityEnum.optional().default('medium'),
  assignedTo: z.string().uuid().optional().nullable(),
});

export const taskUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  dueDate: z.string().datetime({ offset: true }).optional().nullable(),
  priority: taskPriorityEnum.optional(),
  assignedTo: z.string().uuid().optional().nullable(),
  status: taskStatusEnum.optional(),
});

export type TaskPriority = z.infer<typeof taskPriorityEnum>;
export type TaskStatusInput = z.infer<typeof taskStatusEnum>;
