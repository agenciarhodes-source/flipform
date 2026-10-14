import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { isTaskReminderDue, TASK_REMINDER_GRACE_MINUTES } from '@/lib/tasks/reminders';

/**
 * The signed-in person's tasks whose reminder time has come: tasks assigned to them, or created
 * by them without an owner. Read only.
 */
export const GET = withPermission('TASKS_VIEW', async (_req: NextRequest, session) => {
  const now = new Date();
  const tasks = await prisma.task.findMany({
    where: {
      tenantId: session.tenantId,
      status: 'pending',
      remindMinutesBefore: { not: null },
      // The longest reminder is one day; the grace period keeps it visible a while after the time.
      dueDate: {
        gte: new Date(now.getTime() - TASK_REMINDER_GRACE_MINUTES * 60_000),
        lte: new Date(now.getTime() + 24 * 60 * 60_000),
      },
      OR: [
        { assignedTo: session.userId },
        { assignedTo: null, createdBy: session.userId },
      ],
    },
    orderBy: { dueDate: 'asc' },
    take: 50,
    select: {
      id: true,
      title: true,
      dueDate: true,
      remindMinutesBefore: true,
      status: true,
      priority: true,
      lead: { select: { id: true, name: true } },
    },
  });
  const due = tasks.filter((task) => isTaskReminderDue({ ...task, now }));
  return NextResponse.json({
    tasks: due.map((task) => ({
      id: task.id,
      title: task.title,
      dueDate: task.dueDate?.toISOString() || null,
      priority: task.priority,
      leadId: task.lead?.id || null,
      leadName: task.lead?.name || null,
    })),
  });
});
