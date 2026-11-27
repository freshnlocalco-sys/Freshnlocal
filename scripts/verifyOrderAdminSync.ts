/**
 * Offline check of the admin order sync: every network call is faked, so this
 * touches neither Firestore nor Supabase.
 *
 *   npx tsx scripts/verifyOrderAdminSync.ts
 */

process.env.SUPABASE_URL = 'https://supabase.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-key';

const { handleOrderAdminSyncRequest } = await import('../orderAdminSync');

const str = (s: string) => ({ stringValue: s });
const int = (n: number) => ({ integerValue: String(n) });

const restDoc = (fields: Record<string, unknown>) => ({ fields });

const firestoreOrder = {
  status: str('delivered'),
  totalAmount: int(450),
  updatedAt: int(1793000000000),
  createdAt: int(1792000000000),
  pointsEarned: int(8),
  pointsAwarded: { booleanValue: true },
  pointsAwardedAt: int(1793000000000),
  items: { arrayValue: { values: [{ mapValue: { fields: {
    quantity: int(2),
    product: { mapValue: { fields: { id: str('abc-500 g'), name: str('Dill'), price: int(225), unit: str('500 g') } } },
  } } }] } },
};

interface World {
  uid?: string;
  role?: string;
  orderStatus?: number;
  order?: Record<string, unknown>;
  liveRow?: boolean;
  supabaseFails?: string;
}

interface Call { method: string; url: string; body: any }

async function run(world: World, request: Record<string, unknown>) {
  const calls: Call[] = [];
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  globalThis.fetch = (async (input: any, init: any = {}) => {
    const url = String(input);
    const method = init.method ?? 'GET';

    if (url.includes('identitytoolkit')) {
      return world.uid ? json(200, { users: [{ localId: world.uid }] }) : json(400, { error: 'bad token' });
    }
    if (url.includes('firestore.googleapis.com')) {
      if (url.includes('/users/')) {
        return world.role ? json(200, restDoc({ role: str(world.role) })) : json(403, {});
      }
      const status = world.orderStatus ?? 200;
      return status === 200 ? json(200, restDoc(world.order ?? firestoreOrder)) : json(status, {});
    }

    calls.push({ method, url, body: init.body ? JSON.parse(init.body) : undefined });
    if (world.supabaseFails && url.includes(world.supabaseFails) && method !== 'GET') return json(500, { message: 'boom' });
    if (method === 'PATCH') return json(200, world.liveRow === false ? [] : [{ id: 'o1' }]);
    return new Response(null, { status: 204 });
  }) as typeof fetch;

  const reply = await handleOrderAdminSyncRequest({ idToken: 'token', orderId: 'o1', ...request });
  return { reply, calls };
}

let failed = 0;
const check = (name: string, ok: boolean) => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
};

const admin: World = { uid: 'admin1', role: 'admin' };
const orderPatch = (calls: Call[]) => calls.find(c => c.method === 'PATCH' && c.url.includes('/web_orders'));
const ERP_COLUMNS = ['erp_pushed_at', 'erp_order_number', 'erp_party_name'];

{
  const { reply, calls } = await run(admin, { change: 'status' });
  const patch = orderPatch(calls);
  check('status: reaches the live row', reply.status === 200 && reply.body.applied === true && patch?.body.status === 'delivered');
  check('status: only live rows are matched', !!patch?.url.includes('is_deleted=eq.false'));
  check('status: leaves the ERP columns alone', ERP_COLUMNS.every(c => !(c in patch!.body)));
  check('status: carries the points pair together', patch?.body.points_awarded === true && !!patch?.body.points_awarded_at);
  check('status: leaves the lines alone', !calls.some(c => c.url.includes('web_order_items')));
}

{
  const { calls } = await run(admin, { change: 'lines' });
  const patch = orderPatch(calls);
  check('lines: never touches status', !('status' in patch!.body));
  check('lines: leaves the ERP columns alone', ERP_COLUMNS.every(c => !(c in patch!.body)));
  check('lines: updates the total', patch?.body.total_amount === 450);
  const upsert = calls.findIndex(c => c.method === 'POST' && c.url.includes('web_order_items'));
  const cleanup = calls.findIndex(c => c.method === 'DELETE' && c.url.includes('web_order_items'));
  check('lines: new lines go in before old ones come out', upsert !== -1 && upsert < cleanup);
  check('lines: keeps the rows it just wrote', calls[cleanup].url.includes('not.in'));
  check('lines: line total is computed', calls[upsert].body[0].line_total === 450);
}

{
  const { calls } = await run(admin, { change: 'lines', }).then(r => r);
  check('lines: no call ever upserts web_orders', !calls.some(c => c.method === 'POST' && c.url.includes('/web_orders')));
}

{
  const { reply, calls } = await run({ ...admin, order: { ...firestoreOrder, items: { arrayValue: {} } } }, { change: 'lines' });
  check('lines: an empty order keeps its lines', reply.status === 200 && !calls.some(c => c.method === 'DELETE'));
}

{
  const { reply, calls } = await run({ ...admin, supabaseFails: 'web_order_items' }, { change: 'lines' });
  check('lines: a failed write keeps the old lines and reports 500', reply.status === 500 && !calls.some(c => c.method === 'DELETE'));
}

{
  const { reply, calls } = await run(admin, { change: 'emailFlags' });
  const patch = orderPatch(calls);
  check('emailFlags: touches neither status nor total', reply.status === 200 && !('status' in patch!.body) && !('total_amount' in patch!.body));
}

{
  const { reply, calls } = await run({ ...admin, orderStatus: 404 }, { change: 'deleted' });
  const patch = orderPatch(calls);
  check('deleted: soft-deletes with its timestamp', reply.status === 200 && patch?.body.is_deleted === true && !!patch?.body.deleted_on);
  check('deleted: nothing is hard-deleted', !calls.some(c => c.method === 'DELETE'));
}

{
  const { reply, calls } = await run(admin, { change: 'deleted' });
  check('deleted: refused while Firestore still has the order', reply.status === 409 && calls.length === 0);
}

{
  const { reply, calls } = await run({ ...admin, orderStatus: 503 }, { change: 'deleted' });
  check('deleted: a failed read is not taken as gone', reply.status === 502 && calls.length === 0);
}

{
  const { reply, calls } = await run({ ...admin, liveRow: false }, { change: 'lines' });
  check('missing row: reported, lines not written', reply.body.applied === false && !calls.some(c => c.url.includes('web_order_items')));
}

{
  const { reply, calls } = await run({ uid: 'cust1', role: 'customer' }, { change: 'status' });
  check('a customer is refused, even for their own order', reply.status === 403 && calls.length === 0);
}

{
  const { reply, calls } = await run({ uid: 'x' }, { change: 'status' });
  check('no readable profile is refused', reply.status === 403 && calls.length === 0);
}

{
  const { reply, calls } = await run({}, { change: 'status' });
  check('a bad token is refused', reply.status === 401 && calls.length === 0);
}

{
  const { reply } = await run(admin, { change: 'whatever' });
  const { reply: slash } = await run(admin, { change: 'status', orderId: 'a/b' });
  check('bad change and bad id are refused', reply.status === 400 && slash.status === 400);
}

{
  const { calls } = await run(admin, { change: 'status', status: 'cancelled', items: [], totalAmount: 1 });
  check('values in the request are ignored', orderPatch(calls)?.body.status === 'delivered');
}

console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
