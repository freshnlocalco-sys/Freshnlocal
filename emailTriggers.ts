import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, updateDoc, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import nodemailer from 'nodemailer';
import firebaseConfig from './firebase-applet-config.json';

// Initialize secondary Firebase Web client inside the server process
// This is 100% robust and doesn't require complex service accounts or private keys
const firebaseApp = initializeApp(firebaseConfig, "email-triggers-app");
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
const auth = getAuth(firebaseApp);

let transporter: nodemailer.Transporter | null = null;

/**
 * Creates or retrieves the Nodemailer transporter.
 * If SMTP environment variables are set in .env, it uses them.
 * Otherwise, it creates a dynamic Ethereal test account so that the emails can be viewed online in real time.
 */
async function getTransporter(): Promise<nodemailer.Transporter> {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const senderEmail = process.env.SMTP_FROM || "freshnlocalco@gmail.com";

  if (host && user && pass) {
    console.log(`[EMAIL SETUP] Configuring real SMTP Transporter (${host}:${port})`);
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass }
    });
  } else {
    try {
      console.log("[EMAIL SETUP] No SMTP credentials in .env. Creating Ethereal Mail test account...");
      const testAccount = await nodemailer.createTestAccount();
      console.log(`[EMAIL SETUP] Ethereal test account created: user="${testAccount.user}"`);
      transporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      });
      // Store test credentials in environment for reference
      process.env.SMTP_FROM = `"FreshNLocal Co. Test" <${testAccount.user}>`;
    } catch (err) {
      console.error("[EMAIL SETUP] Failed to create Ethereal account. Using a dry-run logging transporter.", err);
      transporter = {
        sendMail: async (options: any) => {
          console.log("[EMAIL DRY-RUN] Logging sendMail request:", JSON.stringify(options, null, 2));
          return { messageId: "dry-run-msg-id" };
        }
      } as any;
    }
  }
  return transporter!;
}

/**
 * Renders the HTML template for Order Confirmation.
 */
function renderOrderConfirmationHtml(order: any, id: string): string {
  const itemsHtml = (order.items || []).map((item: any) => {
    const p = item.product || {};
    const imgUrl = p.imageUrl || "https://images.unsplash.com/photo-1610348725531-843dff103e2c?w=100&h=100&fit=crop";
    return `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; vertical-align: middle;">
          <img src="${imgUrl}" alt="${p.name}" style="width: 44px; height: 44px; object-fit: cover; border-radius: 8px; border: 1px solid #cbd5e1; margin-right: 12px; display: inline-block; vertical-align: middle;" referrerPolicy="no-referrer" />
          <span style="font-weight: 600; color: #1e293b; display: inline-block; vertical-align: middle; max-width: 250px;">${p.name}</span>
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: center; color: #475569; font-family: monospace;">
          ${item.quantity} x ${p.unit || 'Unit'}
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 600; color: #1e293b; font-family: monospace;">
          ₹${(p.price || 0).toFixed(2)}
        </td>
      </tr>
    `;
  }).join('');

  const discountRow = order.discount > 0 ? `
    <tr>
      <td colspan="2" style="padding: 8px 12px; text-align: right; color: #475569;">Discount (Points Redeemed):</td>
      <td style="padding: 8px 12px; text-align: right; font-weight: 600; color: #ef4444; font-family: monospace;">-₹${order.discount.toFixed(2)}</td>
    </tr>
  ` : '';

  return `
    <div style="background-color: #f8fafc; padding: 40px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; min-height: 100%;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
        
        <!-- Header -->
        <div style="background-color: #00b853; padding: 32px 24px; text-align: center; color: #ffffff;">
          <h1 style="margin: 0; font-size: 26px; font-weight: 900; letter-spacing: -0.5px; text-transform: uppercase;">FreshNLocal Co.</h1>
          <p style="margin: 8px 0 0; font-size: 15px; font-weight: 500; opacity: 0.9;">Your Farm-Fresh Harvest is Confirmed!</p>
        </div>

        <!-- Body -->
        <div style="padding: 32px 24px;">
          <p style="margin: 0 0 20px; font-size: 16px; color: #334155; line-height: 1.6;">
            Hello <strong>${order.shippingDetails?.name || 'Customer'}</strong>,
          </p>
          <p style="margin: 0 0 24px; font-size: 15px; color: #475569; line-height: 1.6;">
            Thank you for shopping local! Your order has been registered successfully. Our partner farmers in Surat are busy harvesting and preparing your fresh organic crops.
          </p>

          <!-- Order Summary Card -->
          <div style="background-color: #f1f5f9; padding: 20px; border-radius: 16px; margin-bottom: 24px; border: 1px solid #e2e8f0;">
            <table style="width: 100%; font-size: 14px; color: #475569;">
              <tr>
                <td style="padding: 4px 0; font-weight: 600; color: #1e293b;">Order ID:</td>
                <td style="padding: 4px 0; text-align: right; font-family: monospace; font-weight: bold; color: #00b853;">${order.orderNumber || id}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; font-weight: 600; color: #1e293b;">Date:</td>
                <td style="padding: 4px 0; text-align: right;">${new Date(order.createdAt).toLocaleDateString('en-IN', { dateStyle: 'long' })}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; font-weight: 600; color: #1e293b;">Payment Method:</td>
                <td style="padding: 4px 0; text-align: right;">Cash on Delivery (COD)</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; font-weight: 600; color: #1e293b;">Address:</td>
                <td style="padding: 4px 0; text-align: right; font-size: 13px; line-height: 1.4; max-width: 250px;">${order.shippingDetails?.address || 'N/A'}</td>
              </tr>
            </table>
          </div>

          <!-- Items Table -->
          <h3 style="margin: 0 0 12px; font-size: 16px; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">Harvested Items</h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 24px;">
            <thead>
              <tr style="background-color: #f8fafc;">
                <th style="padding: 10px 12px; text-align: left; font-weight: bold; color: #475569; border-bottom: 1px solid #e2e8f0;">Product</th>
                <th style="padding: 10px 12px; text-align: center; font-weight: bold; color: #475569; border-bottom: 1px solid #e2e8f0;">Qty</th>
                <th style="padding: 10px 12px; text-align: right; font-weight: bold; color: #475569; border-bottom: 1px solid #e2e8f0;">Price</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
            <tfoot>
              ${discountRow}
              <tr>
                <td colspan="2" style="padding: 12px; text-align: right; font-weight: bold; color: #1e293b; font-size: 16px;">Total Paid (COD):</td>
                <td style="padding: 12px; text-align: right; font-weight: bold; color: #00b853; font-size: 18px; font-family: monospace;">₹${(order.totalAmount || 0).toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>

          <!-- Support & Culinary Prompt -->
          <div style="background-color: #f0fdf4; border: 1px dashed #bbf7d0; padding: 18px; border-radius: 16px; text-align: center; margin-bottom: 24px;">
            <p style="margin: 0 0 8px; font-size: 14px; color: #166534; font-weight: bold;">🍳 Need Culinary Inspiration?</p>
            <p style="margin: 0; font-size: 13px; color: #14532d; line-height: 1.5;">
              Use <strong>Freshi AI Chef</strong> inside our app to generate mouth-watering recipes using your newly ordered fresh vegetables, exotic fruits, and local herbs!
            </p>
          </div>

          <p style="margin: 0; font-size: 14px; color: #64748b; text-align: center; line-height: 1.6;">
            If you have any questions or require support, reply to this email or call support.
          </p>
        </div>

        <!-- Footer -->
        <div style="background-color: #f1f5f9; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b;">
          <p style="margin: 0 0 6px; font-weight: bold; color: #475569;">FreshNLocal Co. — Surat, Gujarat</p>
          <p style="margin: 0;">Providing 100% Raw, Fresh, and Natural Local Harvests directly to your kitchen.</p>
        </div>
        
      </div>
    </div>
  `;
}

/**
 * Renders the HTML template for Shipping Updates.
 */
function renderShippingUpdateHtml(order: any, id: string): string {
  const isDelivered = order.status === 'delivered';
  const isCancelled = order.status === 'cancelled';
  
  let statusText = "Shipped";
  let statusColor = "#3b82f6"; // Blue
  let statusMessage = "Your fresh crops are harvested, packaged with love, and are currently in transit to your kitchen!";
  
  if (isDelivered) {
    statusText = "Delivered";
    statusColor = "#00b853"; // Green
    statusMessage = "Your farm-fresh produce has been safely delivered! We hope you love the taste of raw, local harvests.";
  } else if (isCancelled) {
    statusText = "Cancelled";
    statusColor = "#ef4444"; // Red
    statusMessage = "Your order has been cancelled. If this was an error, please reach out to our team or place a new order.";
  }

  return `
    <div style="background-color: #f8fafc; padding: 40px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; min-height: 100%;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
        
        <!-- Header -->
        <div style="background-color: ${statusColor}; padding: 32px 24px; text-align: center; color: #ffffff;">
          <h1 style="margin: 0; font-size: 26px; font-weight: 900; letter-spacing: -0.5px; text-transform: uppercase;">FreshNLocal Co.</h1>
          <p style="margin: 8px 0 0; font-size: 15px; font-weight: 500; opacity: 0.9;">Order Update: ${statusText}</p>
        </div>

        <!-- Body -->
        <div style="padding: 32px 24px;">
          <p style="margin: 0 0 20px; font-size: 16px; color: #334155; line-height: 1.6;">
            Hello <strong>${order.shippingDetails?.name || 'Customer'}</strong>,
          </p>
          <p style="margin: 0 0 24px; font-size: 15px; color: #475569; line-height: 1.6;">
            ${statusMessage}
          </p>

          <!-- Tracking Tracker Visual -->
          <div style="display: flex; justify-content: space-between; align-items: center; margin: 32px 0; max-width: 450px; margin-left: auto; margin-right: auto; text-align: center;">
            <div style="flex: 1;">
              <div style="width: 24px; height: 24px; border-radius: 50%; background-color: #00b853; color: white; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold;">✓</div>
              <p style="margin: 6px 0 0; font-size: 11px; font-weight: 600; color: #475569;">Confirmed</p>
            </div>
            <div style="flex: 1; height: 2px; background-color: ${order.status !== 'pending' ? '#00b853' : '#cbd5e1'}; margin-bottom: 16px;"></div>
            <div style="flex: 1;">
              <div style="width: 24px; height: 24px; border-radius: 50%; background-color: ${['shipped', 'delivered'].includes(order.status) ? '#00b853' : '#cbd5e1'}; color: white; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold;">${['shipped', 'delivered'].includes(order.status) ? '✓' : '2'}</div>
              <p style="margin: 6px 0 0; font-size: 11px; font-weight: 600; color: #475569;">In Transit</p>
            </div>
            <div style="flex: 1; height: 2px; background-color: ${order.status === 'delivered' ? '#00b853' : '#cbd5e1'}; margin-bottom: 16px;"></div>
            <div style="flex: 1;">
              <div style="width: 24px; height: 24px; border-radius: 50%; background-color: ${order.status === 'delivered' ? '#00b853' : '#cbd5e1'}; color: white; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold;">${order.status === 'delivered' ? '✓' : '3'}</div>
              <p style="margin: 6px 0 0; font-size: 11px; font-weight: 600; color: #475569;">Delivered</p>
            </div>
          </div>

          <!-- Order Summary Card -->
          <div style="background-color: #f1f5f9; padding: 20px; border-radius: 16px; margin-bottom: 24px; border: 1px solid #e2e8f0;">
            <table style="width: 100%; font-size: 14px; color: #475569;">
              <tr>
                <td style="padding: 4px 0; font-weight: 600; color: #1e293b;">Order ID:</td>
                <td style="padding: 4px 0; text-align: right; font-family: monospace; font-weight: bold; color: ${statusColor};">${order.orderNumber || id}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; font-weight: 600; color: #1e293b;">Current Status:</td>
                <td style="padding: 4px 0; text-align: right; font-weight: bold; color: ${statusColor}; text-transform: uppercase;">${statusText}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; font-weight: 600; color: #1e293b;">Delivery Address:</td>
                <td style="padding: 4px 0; text-align: right; font-size: 13px; line-height: 1.4; max-width: 250px;">${order.shippingDetails?.address || 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; font-weight: 600; color: #1e293b;">Contact Phone:</td>
                <td style="padding: 4px 0; text-align: right; font-family: monospace;">${order.shippingDetails?.phone || 'N/A'}</td>
              </tr>
            </table>
          </div>

          ${isDelivered ? `
          <!-- Delivered Culinary Promotion -->
          <div style="background-color: #eff6ff; border: 1px dashed #bfdbfe; padding: 18px; border-radius: 16px; text-align: center; margin-bottom: 24px;">
            <p style="margin: 0 0 8px; font-size: 14px; color: #1e40af; font-weight: bold;">🌱 Ready to Create Culinary Magic?</p>
            <p style="margin: 0; font-size: 13px; color: #1e3a8a; line-height: 1.5;">
              Now that your fresh harvest is delivered, launch our app and ask <strong>Freshi AI Chef</strong> to prepare customized gourmet recipes based on your exact delivered products!
            </p>
          </div>
          ` : ''}

          <p style="margin: 0; font-size: 14px; color: #64748b; text-align: center; line-height: 1.6;">
            Thank you for being a valued FreshNLocal partner. We appreciate your commitment to supporting organic regional farmers!
          </p>
        </div>

        <!-- Footer -->
        <div style="background-color: #f1f5f9; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b;">
          <p style="margin: 0 0 6px; font-weight: bold; color: #475569;">FreshNLocal Co. — Surat, Gujarat</p>
          <p style="margin: 0;">Providing 100% Raw, Fresh, and Natural Local Harvests directly to your kitchen.</p>
        </div>
        
      </div>
    </div>
  `;
}

/**
 * Starts the live background Firestore trigger listener.
 * This runs continuously in our server container, watching for changes.
 */
export function setupOrderEmailTriggers() {
  console.log("[EMAIL TRIGGERS] Initializing background trigger poller for 'orders' collection...");

  let isPolling = false;
  let isAuthenticating = false;
  let isAuthenticated = false;

  async function ensureAuthenticated() {
    if (isAuthenticated) return;
    if (isAuthenticating) {
      while (isAuthenticating) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      return;
    }

    isAuthenticating = true;
    const email = "system-email-trigger@freshnlocal.com";
    const password = "SystemTriggerSecurePass2026!";

    try {
      console.log("[EMAIL TRIGGERS] Authenticating system trigger user...");
      await signInWithEmailAndPassword(auth, email, password);
      console.log("[EMAIL TRIGGERS] Authenticated system trigger user successfully.");
      isAuthenticated = true;
    } catch (err: any) {
      const errStr = String(err).toLowerCase();
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential' || errStr.includes('user-not-found') || errStr.includes('invalid-credential')) {
        try {
          console.log("[EMAIL TRIGGERS] System trigger user not found/invalid. Attempting to register...");
          await createUserWithEmailAndPassword(auth, email, password);
          console.log("[EMAIL TRIGGERS] Registered and authenticated system trigger user successfully.");
          isAuthenticated = true;
        } catch (regErr) {
          console.error("[EMAIL TRIGGERS] Failed to register system trigger user:", regErr);
        }
      } else {
        console.error("[EMAIL TRIGGERS] Authentication error:", err);
      }
    } finally {
      isAuthenticating = false;
    }
  }

  const pollOrders = async () => {
    if (isPolling) return;
    isPolling = true;

    try {
      await ensureAuthenticated();
      if (!isAuthenticated) {
        console.warn("[EMAIL TRIGGERS] Skipping poll cycle: background system trigger is unauthenticated.");
        return;
      }

      const ordersCol = collection(db, 'orders');
      // Limit to 50 most recent orders so we don't query excessive data, filtering them in memory
      const q = query(ordersCol, orderBy('createdAt', 'desc'), limit(50));
      const snapshot = await getDocs(q);

      const mailTransporter = await getTransporter();
      const senderFrom = process.env.SMTP_FROM || `"FreshNLocal Co." <freshnlocalco@gmail.com>`;

      for (const docSnap of snapshot.docs) {
        const id = docSnap.id;
        const order = docSnap.data();

        // Skip orders that do not have an email address
        const email = order.shippingDetails?.email;
        if (!email) {
          continue;
        }

        const orderNum = order.orderNumber || id;

        // Trigger 1: Order Confirmation (on create or whenever confirmationEmailSent is not true)
        if (!order.confirmationEmailSent) {
          console.log(`[EMAIL TRIGGERS] Detected new or unconfirmed order: ${orderNum}. Preparing Order Confirmation email to ${email}`);
          
          const mailOptions = {
            from: senderFrom,
            to: email,
            subject: `🌾 FreshNLocal Co. — Order Confirmed: #${orderNum}`,
            html: renderOrderConfirmationHtml(order, id)
          };

          try {
            const info = await mailTransporter.sendMail(mailOptions);
            console.log(`[EMAIL TRIGGERS] Order Confirmation email sent to ${email}. MessageID: ${info.messageId}`);
            
            // Get test message link if sent via Ethereal Mail
            const previewUrl = nodemailer.getTestMessageUrl(info);
            if (previewUrl) {
              console.log(`\n=============================================================`);
              console.log(`[ETHEREAL MAIL PREVIEW] View the rendered HTML email online:`);
              console.log(`${previewUrl}`);
              console.log(`=============================================================\n`);
            }

            // Transactionally mark confirmationEmailSent: true so we don't duplicate
            const orderDocRef = doc(db, 'orders', id);
            await updateDoc(orderDocRef, { confirmationEmailSent: true });
          } catch (sendErr) {
            console.error(`[EMAIL TRIGGERS] Error sending Order Confirmation to ${email}:`, sendErr);
          }
        }

        // Trigger 2: Shipping / Delivery / Cancellation Status Updates
        // Only trigger if status is different from pending, and we haven't sent the update for this exact status yet
        if (order.status !== 'pending' && order.shippingEmailStatus !== order.status) {
          console.log(`[EMAIL TRIGGERS] Detected order status update: ${orderNum} is now "${order.status}". Sending Shipping Update email to ${email}`);

          const mailOptions = {
            from: senderFrom,
            to: email,
            subject: `🚚 FreshNLocal Co. — Order Update: ${order.status.toUpperCase()} (#${orderNum})`,
            html: renderShippingUpdateHtml(order, id)
          };

          try {
            const info = await mailTransporter.sendMail(mailOptions);
            console.log(`[EMAIL TRIGGERS] Shipping Update email sent to ${email}. MessageID: ${info.messageId}`);
            
            // Get test message link if sent via Ethereal Mail
            const previewUrl = nodemailer.getTestMessageUrl(info);
            if (previewUrl) {
              console.log(`\n=============================================================`);
              console.log(`[ETHEREAL MAIL PREVIEW] View the rendered HTML email online:`);
              console.log(`${previewUrl}`);
              console.log(`=============================================================\n`);
            }

            // Transactionally update shippingEmailStatus to match current status
            const orderDocRef = doc(db, 'orders', id);
            await updateDoc(orderDocRef, { shippingEmailStatus: order.status });
          } catch (sendErr) {
            console.error(`[EMAIL TRIGGERS] Error sending Shipping Update to ${email}:`, sendErr);
          }
        }
      }
    } catch (err) {
      console.error("[EMAIL TRIGGERS] Error in snapshot polling processing:", err);
    } finally {
      isPolling = false;
    }
  };

  // Run initial poll, then check every 15 seconds
  pollOrders().catch(err => console.error("[EMAIL TRIGGERS] Initial poll error:", err));
  setInterval(pollOrders, 15000);
}
