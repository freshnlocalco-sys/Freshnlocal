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
/**
 * Renders the HTML template for Order Confirmation.
 */
function renderOrderConfirmationHtml(order: any, id: string): string {
  const isPickup = order.deliveryMethod === 'pickup' || (order.shippingDetails?.address || '').toLowerCase().includes('pickup');

  const itemsHtml = (order.items || []).map((item: any) => {
    const p = item.product || {};
    const imgUrl = p.imageUrl || "https://images.unsplash.com/photo-1610348725531-843dff103e2c?w=100&h=100&fit=crop";
    return `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 16px 12px; vertical-align: middle;">
          <table style="border-collapse: collapse; border: 0;">
            <tr>
              <td style="padding: 0 12px 0 0; vertical-align: middle;">
                <img src="${imgUrl}" alt="${p.name}" class="product-img" style="width: 48px; height: 48px; object-fit: cover; border-radius: 10px; border: 1px solid #e2e8f0; display: block;" referrerPolicy="no-referrer" />
              </td>
              <td style="padding: 0; vertical-align: middle;">
                <span class="product-name" style="font-weight: 600; color: #1e293b; font-size: 14px; display: block; line-height: 1.4; max-width: 250px;">${p.name}</span>
                <span style="font-size: 11px; color: #64748b; display: block; margin-top: 2px;">${p.category || 'Local Produce'}</span>
              </td>
            </tr>
          </table>
        </td>
        <td style="padding: 16px 12px; border-bottom: 1px solid #f1f5f9; text-align: center; color: #475569; font-weight: 500; font-size: 14px;">
          ${item.quantity} <span style="font-size: 12px; color: #94a3b8; font-weight: normal;">x ${p.unit || 'Unit'}</span>
        </td>
        <td style="padding: 16px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: 600; color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px;">
          ₹${(p.price || 0).toFixed(2)}
        </td>
      </tr>
    `;
  }).join('');

  const discountRow = order.discount > 0 ? `
    <tr style="border-bottom: 1px solid #f1f5f9;">
      <td colspan="2" style="padding: 12px; text-align: right; color: #64748b; font-size: 14px; font-weight: 500;">Discount (Points Redeemed):</td>
      <td style="padding: 12px; text-align: right; font-weight: 600; color: #dc2626; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px;">-₹${order.discount.toFixed(2)}</td>
    </tr>
  ` : '';

  const deliveryRow = isPickup ? `
    <tr style="border-bottom: 1px solid #f1f5f9;">
      <td colspan="2" style="padding: 12px; text-align: right; color: #64748b; font-size: 14px; font-weight: 500;">Fulfillment Method:</td>
      <td style="padding: 12px; text-align: right; font-weight: 600; color: #15803d; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px;">Store Pickup (FREE)</td>
    </tr>
  ` : `
    <tr style="border-bottom: 1px solid #f1f5f9;">
      <td colspan="2" style="padding: 12px; text-align: right; color: #64748b; font-size: 14px; font-weight: 500;">Delivery Service:</td>
      <td style="padding: 12px; text-align: right; font-weight: 600; color: #16a34a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px;">FREE</td>
    </tr>
  `;

  const headerTitle = isPickup ? "Pickup Confirmed" : "Harvest Confirmed";
  
  const introMessage = isPickup 
    ? "Thank you for your order! Your organic selections are being reserved and freshly prepared. Our partner farmers in Surat, Gujarat are harvesting them fresh, and we will have your custom bundle ready for pickup at our Bhatar store soon!"
    : "Thank you for supporting 100% natural, regional farming! Our partner farmers in Surat, Gujarat have reserved your selections and are preparing to deliver them fresh.";

  const destinationRow = isPickup ? `
    <tr class="meta-row" style="border-bottom: 1px solid #f1f5f9;">
      <td class="meta-td" style="padding: 10px 0; color: #64748b; font-weight: 500; vertical-align: top;">Store Pickup Address:</td>
      <td class="meta-td-right" style="padding: 10px 0; text-align: right; color: #334155; font-size: 13px; line-height: 1.5; max-width: 250px; font-weight: 600;">
        FreshNLocal.CO Store<br/>
        Gr Floor Hall, Reva Dham Apartment, Uma Bhawan Crossroad, Opp. Ashirwad Palace, Bhatar, Surat, Gujarat
      </td>
    </tr>
    <tr class="meta-row-last">
      <td class="meta-td" style="padding: 10px 0 0; color: #64748b; font-weight: 500;">Store pickup Hours:</td>
      <td class="meta-td-right" style="padding: 10px 0 0; text-align: right; color: #15803d; font-weight: 700;">9:00 AM - 9:00 PM (Daily)</td>
    </tr>
  ` : `
    <tr class="meta-row-last">
      <td class="meta-td" style="padding: 10px 0 0; color: #64748b; font-weight: 500; vertical-align: top;">Delivery Destination:</td>
      <td class="meta-td-right" style="padding: 10px 0 0; text-align: right; color: #334155; font-size: 13px; line-height: 1.5; max-width: 250px;">${order.shippingDetails?.address || 'N/A'}</td>
    </tr>
  `;

  const recipeNotice = isPickup
    ? "Once you collect your fresh organic harvest from our store, use the built-in <strong>Freshi AI Chef</strong> assistant inside our application to instantly design gourmet farm-to-table culinary recipes tailored specifically to these exact ingredients!"
    : "Once your fresh organic harvest arrives, use the built-in <strong>Freshi AI Chef</strong> assistant inside our application to instantly design gourmet farm-to-table culinary recipes tailored specifically to these exact ingredients!";

  return `
    <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
    <html xmlns="http://www.w3.org/1999/xhtml">
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <title>FreshNLocal Co.</title>
      <style type="text/css">
        @media only screen and (max-width: 600px) {
          .container { padding: 12px 8px !important; }
          .card { border-radius: 16px !important; }
          .header-title { font-size: 22px !important; }
          .product-img { width: 38px !important; height: 38px !important; }
          .product-name { max-width: 150px !important; font-size: 13px !important; }
          .meta-td { display: block !important; width: 100% !important; text-align: left !important; box-sizing: border-box; }
          .meta-td-right { display: block !important; width: 100% !important; text-align: left !important; margin-top: 4px; font-weight: bold; }
          .meta-row { display: block !important; border-bottom: 1px solid #f1f5f9; padding: 8px 0; }
          .meta-row-last { display: block !important; padding: 8px 0; }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-text-size-adjust: none; -ms-text-size-adjust: none;">
      <!-- Wrapper -->
      <div class="container" style="background-color: #f8fafc; padding: 40px 16px; min-height: 100%;">
        <div class="card" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05), 0 4px 6px -2px rgba(0,0,0,0.05);">
          
          <!-- Top Accent Bar -->
          <div style="background-color: #15803d; height: 6px;"></div>

          <!-- Header Section -->
          <div style="background-color: #fcfdfa; border-bottom: 1px solid #f1f5f9; padding: 32px 24px; text-align: center;">
            <div style="display: inline-block; margin-bottom: 12px; background-color: #dcfce7; padding: 12px; border-radius: 50%;">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: block; margin: 0 auto;">
                <path d="M12 3c-1.2 0-2.4.3-3.5.9c.3.5.7.9 1.2 1.3c.7-.4 1.5-.6 2.3-.6c3.3 0 6 2.7 6 6c0 .8-.2 1.6-.6 2.3c.4.5.8.9 1.3 1.2c.6-1.1.9-2.3.9-3.5c0-4.4-3.6-8-8-8zm-5.1 4.5C4.6 9.3 4 11.6 4 14c0 4.4 3.6 8 8 8c2.4 0 4.7-.6 6.5-1.7c-.5-.3-.9-.7-1.3-1.2c-.7.4-1.5.6-2.3.6c-3.3 0-6-2.7-6-6c0-.8.2-1.6.6-2.3c-.4-.5-.8-.9-1.3-1.2z" fill="#15803d"/>
                <path d="M12 6c-3.3 0-6 2.7-6 6c0 1.2.4 2.4 1 3.4L15.4 7c-1-.6-2.2-1-3.4-1zm3.4 1.6L7 16c1 .6 2.2 1 3.4 1c3.3 0 6-2.7 6-6c0-1.2-.4-2.4-1-3.4z" fill="#166534"/>
              </svg>
            </div>
            <h1 class="header-title" style="margin: 0; font-size: 26px; font-weight: 800; color: #14532d; letter-spacing: -0.5px;">FreshNLocal Co.</h1>
            <p style="margin: 6px 0 0; font-size: 14px; font-weight: 500; color: #15803d; text-transform: uppercase; letter-spacing: 1px;">${headerTitle}</p>
          </div>

          <!-- Body Section -->
          <div style="padding: 32px 24px;">
            <p style="margin: 0 0 16px; font-size: 16px; color: #1e293b; line-height: 1.6;">
              Hello <strong style="color: #0f172a;">${order.shippingDetails?.name || 'Customer'}</strong>,
            </p>
            <p style="margin: 0 0 28px; font-size: 15px; color: #475569; line-height: 1.6;">
              ${introMessage}
            </p>

            <!-- Order Summary Card -->
            <div style="background-color: #fcfdfa; padding: 24px; border-radius: 16px; margin-bottom: 32px; border: 1px solid #e6f4ea;">
              <h4 style="margin: 0 0 16px; font-size: 13px; font-weight: 700; color: #15803d; text-transform: uppercase; letter-spacing: 1px;">Order Metadata</h4>
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <tr class="meta-row" style="border-bottom: 1px solid #f1f5f9;">
                  <td class="meta-td" style="padding: 10px 0; color: #64748b; font-weight: 500;">Order ID:</td>
                  <td class="meta-td-right" style="padding: 10px 0; text-align: right; font-family: monospace; font-weight: 700; color: #15803d;">#${order.orderNumber || id}</td>
                </tr>
                <tr class="meta-row" style="border-bottom: 1px solid #f1f5f9;">
                  <td class="meta-td" style="padding: 10px 0; color: #64748b; font-weight: 500;">Order Date:</td>
                  <td class="meta-td-right" style="padding: 10px 0; text-align: right; color: #334155;">${new Date(order.createdAt).toLocaleDateString('en-IN', { dateStyle: 'long' })}</td>
                </tr>
                <tr class="meta-row" style="border-bottom: 1px solid #f1f5f9;">
                  <td class="meta-td" style="padding: 10px 0; color: #64748b; font-weight: 500;">Payment Gateway:</td>
                  <td class="meta-td-right" style="padding: 10px 0; text-align: right; color: #334155; font-weight: 600;">Cash on Delivery (COD)</td>
                </tr>
                ${destinationRow}
              </table>
            </div>

            <!-- Items Table -->
            <h3 style="margin: 0 0 16px; font-size: 15px; font-weight: 700; color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px;">Harvest Summary</h3>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 32px;">
              <thead>
                <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                  <th style="padding: 12px; text-align: left; font-weight: 600; color: #475569; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Product</th>
                  <th style="padding: 12px; text-align: center; font-weight: 600; color: #475569; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Quantity</th>
                  <th style="padding: 12px; text-align: right; font-weight: 600; color: #475569; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Price</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
              <tfoot>
                ${discountRow}
                ${deliveryRow}
                <tr>
                  <td colspan="2" style="padding: 20px 12px 12px; text-align: right; font-weight: 700; color: #0f172a; font-size: 15px;">Total Payable Amount:</td>
                  <td style="padding: 20px 12px 12px; text-align: right; font-weight: 800; color: #15803d; font-size: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">₹${(order.totalAmount || 0).toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>

            <!-- Support & Culinary Prompt -->
            <div style="background-color: #f4faf6; border: 1px dashed #a7f3d0; padding: 24px; border-radius: 16px; text-align: center; margin-bottom: 32px;">
              <p style="margin: 0 0 10px; font-size: 15px; color: #14532d; font-weight: 700;">
                🍳 Creative Recipes Await You
              </p>
              <p style="margin: 0; font-size: 13.5px; color: #166534; line-height: 1.6;">
                ${recipeNotice}
              </p>
            </div>

            <!-- Customer Care Notice -->
            <p style="margin: 0; font-size: 13.5px; color: #64748b; text-align: center; line-height: 1.6; border-top: 1px solid #f1f5f9; padding-top: 24px;">
              Need assistance or wish to customize your order pickup slot? Simply reply to this email, or email us directly at <a href="mailto:freshnlocalco@gmail.com" style="color: #15803d; font-weight: 600; text-decoration: none;">freshnlocalco@gmail.com</a>.
            </p>
          </div>

          <!-- Footer Section -->
          <div style="background-color: #f8fafc; padding: 32px 24px; text-align: center; border-top: 1px solid #f1f5f9; font-size: 12px; color: #64748b;">
            <p style="margin: 0 0 8px; font-weight: 700; color: #334155; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">FreshNLocal Co.</p>
            <p style="margin: 0 0 12px; line-height: 1.6;">Providing 100% Raw, Fresh, and Natural Local Harvests directly to your kitchen.</p>
            <p style="margin: 0; color: #94a3b8;">Surat, Gujarat, India &bull; Organic Agri partners</p>
          </div>
          
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Renders the HTML template for Shipping Updates.
 */
/**
 * Renders the HTML template for Shipping Updates.
 */
function renderShippingUpdateHtml(order: any, id: string): string {
  const isPickup = order.deliveryMethod === 'pickup' || (order.shippingDetails?.address || '').toLowerCase().includes('pickup');
  const isDelivered = order.status === 'delivered';
  const isCancelled = order.status === 'cancelled';
  const isShipped = order.status === 'shipped';
  
  let statusText = "Shipped";
  let statusColor = "#1d4ed8"; // Premium blue
  let statusBgColor = "#eff6ff"; // Soft blue
  let statusMessage = "Your fresh crops are harvested, packaged with love, and are currently in transit to your kitchen!";
  let statusIconColor = "#3b82f6";
  
  if (isPickup) {
    if (isDelivered) {
      statusText = "Picked Up";
      statusColor = "#15803d"; // Premium green
      statusBgColor = "#f0fdf4"; // Soft green
      statusMessage = "Your order has been successfully picked up! Thank you for choosing FreshNLocal. We hope you love your farm-fresh local produce.";
      statusIconColor = "#10b981";
    } else if (isShipped) {
      statusText = "Ready for Pickup";
      statusColor = "#16a34a"; // Vibrant green
      statusBgColor = "#f0fdf4"; // Soft green
      statusMessage = "Good news! Your fresh farm selections have been harvested, sorted, and have arrived at our Bhatar store. Your package is ready for collection at your convenience during store hours (9 AM - 9 PM).";
      statusIconColor = "#22c55e";
    } else if (isCancelled) {
      statusText = "Cancelled";
      statusColor = "#b91c1c"; // Premium red
      statusBgColor = "#fef2f2"; // Soft red
      statusMessage = "Your store pickup order has been cancelled. If this was an error, please reach out to our team or place a new order.";
      statusIconColor = "#f43f5e";
    } else {
      statusText = "Confirmed";
      statusColor = "#d97706"; // Warm amber
      statusBgColor = "#fffbeb"; // Soft amber
      statusMessage = "Your order is confirmed! Our regional partner farmers are harvesting your items, and we are preparing everything for your store pickup.";
      statusIconColor = "#f59e0b";
    }
  } else {
    if (isDelivered) {
      statusText = "Delivered";
      statusColor = "#15803d"; // Premium green
      statusBgColor = "#f0fdf4"; // Soft green
      statusMessage = "Your farm-fresh produce has been safely delivered! We hope you love the taste of raw, local harvests.";
      statusIconColor = "#10b981";
    } else if (isCancelled) {
      statusText = "Cancelled";
      statusColor = "#b91c1c"; // Premium red
      statusBgColor = "#fef2f2"; // Soft red
      statusMessage = "Your order has been cancelled. If this was an error, please reach out to our team or place a new order.";
      statusIconColor = "#f43f5e";
    }
  }

  const trackerConnector1Color = order.status !== 'pending' ? '#15803d' : '#cbd5e1';
  const trackerConnector2Color = order.status === 'delivered' ? '#15803d' : '#cbd5e1';

  const step2Active = ['shipped', 'delivered'].includes(order.status);
  const step2Bg = step2Active ? '#15803d' : '#cbd5e1';
  const step2Color = step2Active ? '#ffffff' : '#64748b';
  const step2Border = step2Active ? 'none' : '2px solid #cbd5e1';
  const step2FontWeight = order.status === 'shipped' ? '700' : '600';
  const step2LabelColor = step2Active ? '#1e293b' : '#94a3b8';

  const step3Active = order.status === 'delivered';
  const step3Bg = step3Active ? '#15803d' : '#cbd5e1';
  const step3Color = step3Active ? '#ffffff' : '#64748b';
  const step3Border = step3Active ? 'none' : '2px solid #cbd5e1';
  const step3FontWeight = step3Active ? '700' : '600';
  const step3LabelColor = step3Active ? '#1e293b' : '#94a3b8';

  const destinationRow = isPickup ? `
    <tr class="meta-row" style="border-bottom: 1px solid #f1f5f9;">
      <td class="meta-td" style="padding: 10px 0; color: #64748b; font-weight: 500; vertical-align: top;">Store Pickup Address:</td>
      <td class="meta-td-right" style="padding: 10px 0; text-align: right; color: #334155; font-size: 13px; line-height: 1.5; max-width: 250px; font-weight: 600;">
        FreshNLocal.CO Store<br/>
        Gr Floor Hall, Reva Dham Apartment, Uma Bhawan Crossroad, Opp. Ashirwad Palace, Bhatar, Surat, Gujarat
      </td>
    </tr>
    <tr class="meta-row" style="border-bottom: 1px solid #f1f5f9;">
      <td class="meta-td" style="padding: 10px 0; color: #64748b; font-weight: 500;">Store Hours:</td>
      <td class="meta-td-right" style="padding: 10px 0; text-align: right; color: #15803d; font-weight: 700;">9:00 AM - 9:00 PM (Daily)</td>
    </tr>
  ` : `
    <tr class="meta-row" style="border-bottom: 1px solid #f1f5f9;">
      <td class="meta-td" style="padding: 10px 0; color: #64748b; font-weight: 500;">Delivery Address:</td>
      <td class="meta-td-right" style="padding: 10px 0; text-align: right; color: #334155; font-size: 13px; line-height: 1.5; max-width: 250px;">${order.shippingDetails?.address || 'N/A'}</td>
    </tr>
  `;

  const dynamicNotice = isDelivered ? `
    <!-- Delivered Culinary Promotion -->
    <div style="background-color: #f4faf6; border: 1px dashed #a7f3d0; padding: 24px; border-radius: 16px; text-align: center; margin-bottom: 32px;">
      <p style="margin: 0 0 10px; font-size: 15px; color: #14532d; font-weight: 700;">
        🌱 Ready to Create Culinary Magic?
      </p>
      <p style="margin: 0; font-size: 13.5px; color: #166534; line-height: 1.6;">
        Now that your fresh organic harvest has been successfully ${isPickup ? 'picked up' : 'delivered'}, launch our application and ask <strong>Freshi AI Chef</strong> to prepare customized gourmet recipes based on your exact ${isPickup ? 'picked up' : 'delivered'} products!
      </p>
    </div>
  ` : '';

  return `
    <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
    <html xmlns="http://www.w3.org/1999/xhtml">
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <title>FreshNLocal Co.</title>
      <style type="text/css">
        @media only screen and (max-width: 600px) {
          .container { padding: 12px 8px !important; }
          .card { border-radius: 16px !important; }
          .header-title { font-size: 22px !important; }
          .meta-td { display: block !important; width: 100% !important; text-align: left !important; box-sizing: border-box; }
          .meta-td-right { display: block !important; width: 100% !important; text-align: left !important; margin-top: 4px; font-weight: bold; }
          .meta-row { display: block !important; border-bottom: 1px solid #f1f5f9; padding: 8px 0; }
          .meta-row-last { display: block !important; padding: 8px 0; }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-text-size-adjust: none; -ms-text-size-adjust: none;">
      <!-- Wrapper -->
      <div class="container" style="background-color: #f8fafc; padding: 40px 16px; min-height: 100%;">
        <div class="card" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05), 0 4px 6px -2px rgba(0,0,0,0.05);">
          
          <!-- Top Accent Bar -->
          <div style="background-color: ${statusColor}; height: 6px;"></div>

          <!-- Header Section -->
          <div style="background-color: #fcfdfa; border-bottom: 1px solid #f1f5f9; padding: 32px 24px; text-align: center;">
            <div style="display: inline-block; margin-bottom: 12px; background-color: ${statusBgColor}; padding: 12px; border-radius: 50%;">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: block; margin: 0 auto;">
                <path d="M12 3c-1.2 0-2.4.3-3.5.9c.3.5.7.9 1.2 1.3c.7-.4 1.5-.6 2.3-.6c3.3 0 6 2.7 6 6c0 .8-.2 1.6-.6 2.3c.4.5.8.9 1.3 1.2c.6-1.1.9-2.3.9-3.5c0-4.4-3.6-8-8-8zm-5.1 4.5C4.6 9.3 4 11.6 4 14c0 4.4 3.6 8 8 8c2.4 0 4.7-.6 6.5-1.7c-.5-.3-.9-.7-1.3-1.2c-.7.4-1.5.6-2.3.6c-3.3 0-6-2.7-6-6c0-.8.2-1.6.6-2.3c-.4-.5-.8-.9-1.3-1.2z" fill="${statusColor}"/>
                <path d="M12 6c-3.3 0-6 2.7-6 6c0 1.2.4 2.4 1 3.4L15.4 7c-1-.6-2.2-1-3.4-1zm3.4 1.6L7 16c1 .6 2.2 1 3.4 1c3.3 0 6-2.7 6-6c0-1.2-.4-2.4-1-3.4z" fill="${statusColor}"/>
              </svg>
            </div>
            <h1 class="header-title" style="margin: 0; font-size: 26px; font-weight: 800; color: #14532d; letter-spacing: -0.5px;">FreshNLocal Co.</h1>
            <p style="margin: 6px 0 0; font-size: 14px; font-weight: 500; color: ${statusColor}; text-transform: uppercase; letter-spacing: 1px;">Order Status: ${statusText}</p>
          </div>

          <!-- Body Section -->
          <div style="padding: 32px 24px;">
            <p style="margin: 0 0 16px; font-size: 16px; color: #1e293b; line-height: 1.6;">
              Hello <strong style="color: #0f172a;">${order.shippingDetails?.name || 'Customer'}</strong>,
            </p>
            <p style="margin: 0 0 28px; font-size: 15px; color: #475569; line-height: 1.6;">
              ${statusMessage}
            </p>

            <!-- Tracking Tracker Visual -->
            <table class="tracker-table" style="width: 100%; border-collapse: collapse; margin: 32px 0 32px; font-size: 13px;">
              <tr>
                <!-- Step 1: Confirmed -->
                <td class="tracker-cell" style="width: 30%; text-align: center; vertical-align: top;">
                  <div style="width: 28px; height: 28px; border-radius: 50%; background-color: #15803d; color: #ffffff; line-height: 28px; font-size: 12px; font-weight: bold; margin: 0 auto; display: inline-block; text-align: center; box-shadow: 0 4px 6px -1px rgba(21,128,61,0.2);">✓</div>
                  <div style="font-weight: 700; color: #1e293b; margin-top: 8px;">Confirmed</div>
                  <div style="font-size: 11px; color: #64748b; margin-top: 2px; word-break: keep-all;">${isPickup ? 'Preparing Pickup' : 'Farmer Reserved'}</div>
                </td>
                
                <!-- Connector 1 -->
                <td class="tracker-connector" style="width: 5%; vertical-align: middle; padding-bottom: 30px;">
                  <div style="height: 3px; background-color: ${trackerConnector1Color}; width: 100%;"></div>
                </td>
                
                <!-- Step 2: In Transit / Ready for Pickup -->
                <td class="tracker-cell" style="width: 30%; text-align: center; vertical-align: top;">
                  <div style="width: 28px; height: 28px; border-radius: 50%; background-color: ${step2Bg}; color: ${step2Color}; line-height: 28px; font-size: 12px; font-weight: bold; margin: 0 auto; display: inline-block; text-align: center; border: ${step2Border}; box-sizing: border-box;">
                    ${step2Active ? '✓' : '2'}
                  </div>
                  <div style="font-weight: ${step2FontWeight}; color: ${step2LabelColor}; margin-top: 8px;">${isPickup ? 'Ready for Pickup' : 'In Transit'}</div>
                  <div style="font-size: 11px; color: #64748b; margin-top: 2px; word-break: keep-all;">${isPickup ? 'At Bhatar Store' : 'Crops Dispatched'}</div>
                </td>
                
                <!-- Connector 2 -->
                <td class="tracker-connector" style="width: 5%; vertical-align: middle; padding-bottom: 30px;">
                  <div style="height: 3px; background-color: ${trackerConnector2Color}; width: 100%;"></div>
                </td>
                
                <!-- Step 3: Delivered / Picked Up -->
                <td class="tracker-cell" style="width: 30%; text-align: center; vertical-align: top;">
                  <div style="width: 28px; height: 28px; border-radius: 50%; background-color: ${step3Bg}; color: ${step3Color}; line-height: 28px; font-size: 12px; font-weight: bold; margin: 0 auto; display: inline-block; text-align: center; border: ${step3Border}; box-sizing: border-box;">
                    ${step3Active ? '✓' : '3'}
                  </div>
                  <div style="font-weight: ${step3FontWeight}; color: ${step3LabelColor}; margin-top: 8px;">${isPickup ? 'Picked Up' : 'Delivered'}</div>
                  <div style="font-size: 11px; color: #64748b; margin-top: 2px; word-break: keep-all;">${isPickup ? 'Completed' : 'At Your Doorstep'}</div>
                </td>
              </tr>
            </table>

            <!-- Order Summary Card -->
            <div style="background-color: #fcfdfa; padding: 24px; border-radius: 16px; margin-bottom: 32px; border: 1px solid #e6f4ea;">
              <h4 style="margin: 0 0 16px; font-size: 13px; font-weight: 700; color: #15803d; text-transform: uppercase; letter-spacing: 1px;">${isPickup ? 'Pickup Metadata' : 'Dispatch Metadata'}</h4>
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <tr class="meta-row" style="border-bottom: 1px solid #f1f5f9;">
                  <td class="meta-td" style="padding: 10px 0; color: #64748b; font-weight: 500;">Order ID:</td>
                  <td class="meta-td-right" style="padding: 10px 0; text-align: right; font-family: monospace; font-weight: 700; color: ${statusColor};">#${order.orderNumber || id}</td>
                </tr>
                <tr class="meta-row" style="border-bottom: 1px solid #f1f5f9;">
                  <td class="meta-td" style="padding: 10px 0; color: #64748b; font-weight: 500;">Current Status:</td>
                  <td class="meta-td-right" style="padding: 10px 0; text-align: right; font-weight: 700; color: ${statusColor}; text-transform: uppercase; font-size: 13px;">${statusText}</td>
                </tr>
                ${destinationRow}
                <tr class="meta-row-last">
                  <td class="meta-td" style="padding: 10px 0 0; color: #64748b; font-weight: 500;">Contact Phone:</td>
                  <td class="meta-td-right" style="padding: 10px 0 0; text-align: right; color: #334155; font-family: monospace;">${order.shippingDetails?.phone || 'N/A'}</td>
                </tr>
              </table>
            </div>

            ${dynamicNotice}

            <!-- Customer Care Notice -->
            <p style="margin: 0; font-size: 13.5px; color: #64748b; text-align: center; line-height: 1.6; border-top: 1px solid #f1f5f9; padding-top: 24px;">
              Have questions regarding this status update? Simply reply to this email, or email us directly at <a href="mailto:freshnlocalco@gmail.com" style="color: #15803d; font-weight: 600; text-decoration: none;">freshnlocalco@gmail.com</a>.
            </p>
          </div>

          <!-- Footer Section -->
          <div style="background-color: #f8fafc; padding: 32px 24px; text-align: center; border-top: 1px solid #f1f5f9; font-size: 12px; color: #64748b;">
            <p style="margin: 0 0 8px; font-weight: 700; color: #334155; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">FreshNLocal Co.</p>
            <p style="margin: 0 0 12px; line-height: 1.6;">Providing 100% Raw, Fresh, and Natural Local Harvests directly to your kitchen.</p>
            <p style="margin: 0; color: #94a3b8;">Surat, Gujarat, India &bull; Organic Agri partners</p>
          </div>
          
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Renders the HTML template for Admin Order Notifications.
 */
function renderAdminOrderNotificationHtml(order: any, id: string): string {
  const itemsHtml = (order.items || []).map((item: any) => {
    const p = item.product || {};
    const imgUrl = p.imageUrl || "https://images.unsplash.com/photo-1610348725531-843dff103e2c?w=100&h=100&fit=crop";
    return `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 16px 12px; vertical-align: middle;">
          <table style="border-collapse: collapse; border: 0;">
            <tr>
              <td style="padding: 0 12px 0 0; vertical-align: middle;">
                <img src="${imgUrl}" alt="${p.name}" class="product-img" style="width: 48px; height: 48px; object-fit: cover; border-radius: 10px; border: 1px solid #e2e8f0; display: block;" referrerPolicy="no-referrer" />
              </td>
              <td style="padding: 0; vertical-align: middle;">
                <span class="product-name" style="font-weight: 600; color: #1e293b; font-size: 14px; display: block; line-height: 1.4; max-width: 250px;">${p.name}</span>
                <span style="font-size: 11px; color: #64748b; display: block; margin-top: 2px;">${p.category || 'Local Produce'}</span>
              </td>
            </tr>
          </table>
        </td>
        <td style="padding: 16px 12px; border-bottom: 1px solid #f1f5f9; text-align: center; color: #475569; font-weight: 500; font-size: 14px;">
          ${item.quantity} <span style="font-size: 12px; color: #94a3b8; font-weight: normal;">x ${p.unit || 'Unit'}</span>
        </td>
        <td style="padding: 16px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: 600; color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px;">
          ₹${(p.price || 0).toFixed(2)}
        </td>
      </tr>
    `;
  }).join('');

  const discountRow = order.discount > 0 ? `
    <tr style="border-bottom: 1px solid #f1f5f9;">
      <td colspan="2" style="padding: 12px; text-align: right; color: #64748b; font-size: 14px; font-weight: 500;">Discount (Points Redeemed):</td>
      <td style="padding: 12px; text-align: right; font-weight: 600; color: #dc2626; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px;">-₹${order.discount.toFixed(2)}</td>
    </tr>
  ` : '';

  const deliveryRow = `
    <tr style="border-bottom: 1px solid #f1f5f9;">
      <td colspan="2" style="padding: 12px; text-align: right; color: #64748b; font-size: 14px; font-weight: 500;">Delivery Service:</td>
      <td style="padding: 12px; text-align: right; font-weight: 600; color: #16a34a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px;">FREE</td>
    </tr>
  `;

  return `
    <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
    <html xmlns="http://www.w3.org/1999/xhtml">
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <title>FreshNLocal Co. - Admin Alert</title>
      <style type="text/css">
        @media only screen and (max-width: 600px) {
          .container { padding: 12px 8px !important; }
          .card { border-radius: 16px !important; }
          .header-title { font-size: 22px !important; }
          .product-img { width: 38px !important; height: 38px !important; }
          .product-name { max-width: 150px !important; font-size: 13px !important; }
          .meta-td { display: block !important; width: 100% !important; text-align: left !important; box-sizing: border-box; }
          .meta-td-right { display: block !important; width: 100% !important; text-align: left !important; margin-top: 4px; font-weight: bold; }
          .meta-row { display: block !important; border-bottom: 1px solid #f1f5f9; padding: 8px 0; }
          .meta-row-last { display: block !important; padding: 8px 0; }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-text-size-adjust: none; -ms-text-size-adjust: none;">
      <!-- Wrapper -->
      <div class="container" style="background-color: #f8fafc; padding: 40px 16px; min-height: 100%;">
        <div class="card" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05), 0 4px 6px -2px rgba(0,0,0,0.05);">
          
          <!-- Top Accent Bar -->
          <div style="background-color: #ea580c; height: 6px;"></div>

          <!-- Header Section -->
          <div style="background-color: #fffaf0; border-bottom: 1px solid #f1f5f9; padding: 32px 24px; text-align: center;">
            <div style="display: inline-block; margin-bottom: 12px; background-color: #ffedd5; padding: 12px; border-radius: 50%;">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: block; margin: 0 auto;">
                <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" fill="#ea580c"/>
              </svg>
            </div>
            <h1 class="header-title" style="margin: 0; font-size: 26px; font-weight: 800; color: #7c2d12; letter-spacing: -0.5px;">FreshNLocal Co.</h1>
            <p style="margin: 6px 0 0; font-size: 14px; font-weight: 500; color: #ea580c; text-transform: uppercase; letter-spacing: 1px;">🔔 NEW ORDER RECEIVED</p>
          </div>

          <!-- Body Section -->
          <div style="padding: 32px 24px;">
            <p style="margin: 0 0 16px; font-size: 16px; color: #1e293b; line-height: 1.6;">
              Hello <strong style="color: #0f172a;">FreshNLocal Admin</strong>,
            </p>
            <p style="margin: 0 0 28px; font-size: 15px; color: #475569; line-height: 1.6;">
              A new customer has placed an order! Please review the order details below and coordinate harvesting/packaging with the farmers.
            </p>

            <!-- Order Summary Card -->
            <div style="background-color: #fffaf0; padding: 24px; border-radius: 16px; margin-bottom: 32px; border: 1px solid #ffedd5;">
              <h4 style="margin: 0 0 16px; font-size: 13px; font-weight: 700; color: #ea580c; text-transform: uppercase; letter-spacing: 1px;">Order & Shipping Metadata</h4>
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <tr class="meta-row" style="border-bottom: 1px solid #ffedd5;">
                  <td class="meta-td" style="padding: 10px 0; color: #7c2d12; font-weight: 500;">Order ID:</td>
                  <td class="meta-td-right" style="padding: 10px 0; text-align: right; font-family: monospace; font-weight: 700; color: #ea580c;">#${order.orderNumber || id}</td>
                </tr>
                <tr class="meta-row" style="border-bottom: 1px solid #ffedd5;">
                  <td class="meta-td" style="padding: 10px 0; color: #7c2d12; font-weight: 500;">Customer Name:</td>
                  <td class="meta-td-right" style="padding: 10px 0; text-align: right; color: #334155; font-weight: 600;">${order.shippingDetails?.name || 'N/A'}</td>
                </tr>
                <tr class="meta-row" style="border-bottom: 1px solid #ffedd5;">
                  <td class="meta-td" style="padding: 10px 0; color: #7c2d12; font-weight: 500;">Customer Email:</td>
                  <td class="meta-td-right" style="padding: 10px 0; text-align: right; color: #334155;">${order.shippingDetails?.email || 'N/A'}</td>
                </tr>
                <tr class="meta-row" style="border-bottom: 1px solid #ffedd5;">
                  <td class="meta-td" style="padding: 10px 0; color: #7c2d12; font-weight: 500;">Customer Phone:</td>
                  <td class="meta-td-right" style="padding: 10px 0; text-align: right; color: #334155; font-family: monospace; font-weight: 600;">${order.shippingDetails?.phone || 'N/A'}</td>
                </tr>
                <tr class="meta-row" style="border-bottom: 1px solid #ffedd5;">
                  <td class="meta-td" style="padding: 10px 0; color: #7c2d12; font-weight: 500;">Order Date:</td>
                  <td class="meta-td-right" style="padding: 10px 0; text-align: right; color: #334155;">${new Date(order.createdAt).toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' })}</td>
                </tr>
                <tr class="meta-row" style="border-bottom: 1px solid #ffedd5;">
                  <td class="meta-td" style="padding: 10px 0; color: #7c2d12; font-weight: 500;">Payment Gateway:</td>
                  <td class="meta-td-right" style="padding: 10px 0; text-align: right; color: #334155; font-weight: 600;">Cash on Delivery (COD)</td>
                </tr>
                <tr class="meta-row-last">
                  <td class="meta-td" style="padding: 10px 0 0; color: #7c2d12; font-weight: 500; vertical-align: top;">Delivery Destination:</td>
                  <td class="meta-td-right" style="padding: 10px 0 0; text-align: right; color: #334155; font-size: 13px; line-height: 1.5; max-width: 250px;">${order.shippingDetails?.address || 'N/A'}</td>
                </tr>
              </table>
            </div>

            <!-- Items Table -->
            <h3 style="margin: 0 0 16px; font-size: 15px; font-weight: 700; color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px;">Items Requested</h3>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 32px;">
              <thead>
                <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                  <th style="padding: 12px; text-align: left; font-weight: 600; color: #475569; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Product</th>
                  <th style="padding: 12px; text-align: center; font-weight: 600; color: #475569; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Quantity</th>
                  <th style="padding: 12px; text-align: right; font-weight: 600; color: #475569; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Price</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
              <tfoot>
                ${discountRow}
                ${deliveryRow}
                <tr>
                  <td colspan="2" style="padding: 20px 12px 12px; text-align: right; font-weight: 700; color: #0f172a; font-size: 15px;">Total Collectable (COD):</td>
                  <td style="padding: 20px 12px 12px; text-align: right; font-weight: 800; color: #ea580c; font-size: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">₹${(order.totalAmount || 0).toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>

            <!-- Quick Action Notice -->
            <p style="margin: 0; font-size: 13.5px; color: #64748b; text-align: center; line-height: 1.6; border-top: 1px solid #f1f5f9; padding-top: 24px;">
              Please coordinate packaging with regional farmers in Surat, Gujarat. This notification is sent automatically.
            </p>
          </div>

          <!-- Footer Section -->
          <div style="background-color: #f8fafc; padding: 32px 24px; text-align: center; border-top: 1px solid #f1f5f9; font-size: 12px; color: #64748b;">
            <p style="margin: 0 0 8px; font-weight: 700; color: #334155; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">FreshNLocal Admin Portal</p>
            <p style="margin: 0 0 12px; line-height: 1.6;">Providing 100% Raw, Fresh, and Natural Local Harvests directly to your kitchen.</p>
            <p style="margin: 0; color: #94a3b8;">Surat, Gujarat, India &bull; Organic Agri partners</p>
          </div>
          
        </div>
      </div>
    </body>
    </html>
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

          // Admin notification setup
          const adminMailOptions = {
            from: senderFrom,
            to: "freshnlocalco@gmail.com",
            subject: `🔔 New Order Received! #${orderNum} - ${order.shippingDetails?.name || 'Customer'}`,
            html: renderAdminOrderNotificationHtml(order, id)
          };

          // Send Customer Email
          try {
            const info = await mailTransporter.sendMail(mailOptions);
            console.log(`[EMAIL TRIGGERS] Order Confirmation email sent to ${email}. MessageID: ${info.messageId}`);
            
            // Get test message link if sent via Ethereal Mail
            const previewUrl = nodemailer.getTestMessageUrl(info);
            if (previewUrl) {
              console.log(`\n=============================================================`);
              console.log(`[ETHEREAL MAIL PREVIEW] View Customer HTML email online:`);
              console.log(`${previewUrl}`);
              console.log(`=============================================================\n`);
            }
          } catch (sendErr) {
            console.error(`[EMAIL TRIGGERS] Error sending Order Confirmation to ${email}:`, sendErr);
          }

          // Send Admin Notification Email
          try {
            console.log(`[EMAIL TRIGGERS] Preparing Admin Order Notification email to freshnlocalco@gmail.com`);
            const adminInfo = await mailTransporter.sendMail(adminMailOptions);
            console.log(`[EMAIL TRIGGERS] Admin Order Notification email sent to freshnlocalco@gmail.com. MessageID: ${adminInfo.messageId}`);
            
            // Get test message link if sent via Ethereal Mail
            const adminPreviewUrl = nodemailer.getTestMessageUrl(adminInfo);
            if (adminPreviewUrl) {
              console.log(`\n=============================================================`);
              console.log(`[ETHEREAL MAIL PREVIEW] View Admin Notification HTML email online:`);
              console.log(`${adminPreviewUrl}`);
              console.log(`=============================================================\n`);
            }
          } catch (adminSendErr) {
            console.error(`[EMAIL TRIGGERS] Error sending Admin Notification to freshnlocalco@gmail.com:`, adminSendErr);
          }

          // Transactionally mark confirmationEmailSent: true so we don't duplicate
          try {
            const orderDocRef = doc(db, 'orders', id);
            await updateDoc(orderDocRef, { confirmationEmailSent: true });
          } catch (dbErr) {
            console.error(`[EMAIL TRIGGERS] Error updating confirmationEmailSent flag in Firestore for order ${id}:`, dbErr);
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

/**
 * Directly sends a cancellation email without relying on the polling mechanism.
 * Useful when an order is being permanently deleted from the database.
 */
export async function sendCancellationEmailDirect(order: any, id: string) {
  const mailTransporter = await getTransporter();
  const senderFrom = process.env.SMTP_FROM || `"FreshNLocal Co." <freshnlocalco@gmail.com>`;
  const email = order.shippingDetails?.email;

  if (!email) {
    console.log(`[EMAIL TRIGGERS] No email address found for order ${id}, skipping cancellation email.`);
    return;
  }

  const orderNum = order.orderNumber || id;
  // Ensure the status is set to 'cancelled' so the HTML template renders the cancellation variant
  const cancelledOrder = { ...order, status: 'cancelled' };

  console.log(`[EMAIL TRIGGERS] Preparing direct Cancellation email to ${email} for order #${orderNum}`);

  const mailOptions = {
    from: senderFrom,
    to: email,
    subject: `🚚 FreshNLocal Co. — Order Update: CANCELLED (#${orderNum})`,
    html: renderShippingUpdateHtml(cancelledOrder, id)
  };

  try {
    const info = await mailTransporter.sendMail(mailOptions);
    console.log(`[EMAIL TRIGGERS] Cancellation email sent to ${email}. MessageID: ${info.messageId}`);
    
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log(`\n=============================================================`);
      console.log(`[ETHEREAL MAIL PREVIEW] View Cancellation email online:`);
      console.log(`${previewUrl}`);
      console.log(`=============================================================\n`);
    }
  } catch (err) {
    console.error(`[EMAIL TRIGGERS] Error sending Cancellation email to ${email}:`, err);
    throw err;
  }
}
