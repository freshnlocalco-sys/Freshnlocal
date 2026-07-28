import { sendCancellationEmailDirect } from "../../emailTriggers";

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { order, id } = req.body;
    if (!order || !id) {
      return res.status(400).json({ error: "Missing order or id" });
    }
    
    // Attempt to send the email directly
    await sendCancellationEmailDirect(order, id);
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error(`[EMAIL-API] Failed to send cancellation email:`, error);
    return res.status(500).json({ error: error?.message || "Failed to send cancellation email" });
  }
}
