'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function AllowedUsersPage() {
  const [items, setItems] = useState<any[]>([]);
  const [email, setEmail] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [role, setRole] = useState('agent');

  const load = async () => {
    const res = await fetch('/api/admin/allowed-users');
    const data = await res.json();
    setItems(data.items || []);
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    const res = await fetch('/api/admin/allowed-users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, tenantId, role }),
    });
    if (res.ok) {
      setEmail('');
      setTenantId('');
      setRole('agent');
      load();
    }
  };

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Allowlist de usuários</h1>
      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input placeholder="email@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input placeholder="tenantId (somente super admin)" value={tenantId} onChange={(e) => setTenantId(e.target.value)} />
          <Input placeholder="role (owner/admin/manager/agent/viewer)" value={role} onChange={(e) => setRole(e.target.value)} />
        </div>
        <Button onClick={create}>Autorizar e-mail</Button>
      </Card>

      <Card className="p-4">
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="text-sm border rounded p-2 flex items-center justify-between">
              <div>
                <div className="font-medium">{item.email}</div>
                <div className="text-muted-foreground">tenant: {item.tenant?.name || item.tenantId} · role: {item.role}</div>
              </div>
              <div className={item.active ? 'text-emerald-600' : 'text-muted-foreground'}>{item.active ? 'ativo' : 'inativo'}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
