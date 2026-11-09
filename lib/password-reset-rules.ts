import { z } from 'zod';

/**
 * Setting a new password for someone who forgot theirs. The person who resets types the new
 * password; it is never shown again nor kept anywhere but as a hash. Pure rules, easy to test.
 */

export const passwordResetSchema = z.object({
  newPassword: z.string().min(8, 'A nova senha deve ter no mínimo 8 caracteres.').max(128, 'A senha pode ter no máximo 128 caracteres.'),
  confirmNewPassword: z.string().min(1, 'Confirme a nova senha.'),
  reason: z.string().trim().max(500).optional(),
}).strict().refine((body) => body.newPassword === body.confirmNewPassword, {
  message: 'A confirmação não confere com a nova senha.',
  path: ['confirmNewPassword'],
});

/**
 * Whether the owner or an admin of a company may reset this person's password from the Users page.
 * Only for someone who uses this company alone: a person who also enters other companies (a
 * business group, for example) is reset by the Super Admin, so one company never changes the
 * access someone has to another.
 */
export function companyMayResetPassword(input: {
  isSelf: boolean;
  targetIsPlatformAdmin: boolean;
  targetRole: string;
  canManageTargetRole: boolean;
  targetCompanies: number;
}): { ok: true } | { ok: false; status: number; error: string } {
  if (input.isSelf) return { ok: false, status: 400, error: 'Para trocar a sua própria senha, use "Alterar senha" no seu perfil.' };
  if (input.targetIsPlatformAdmin) return { ok: false, status: 403, error: 'Esta senha só pode ser trocada pela própria pessoa.' };
  if (input.targetRole === 'owner' || !input.canManageTargetRole) {
    return { ok: false, status: 403, error: 'Você não tem permissão para trocar a senha deste usuário.' };
  }
  if (input.targetCompanies > 1) {
    return {
      ok: false,
      status: 403,
      error: 'Esta pessoa também acessa outras empresas. Peça ao suporte do FlipForm para trocar a senha.',
    };
  }
  return { ok: true };
}
