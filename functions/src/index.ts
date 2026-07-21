import { onRequest } from "firebase-functions/v2/https";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as nodemailer from "nodemailer";

// Initialize the Firebase Admin SDK
admin.initializeApp();

const db = admin.firestore();

/**
 * Retrieves the Nodemailer mail transporter.
 * Configured via standard Firebase environment configuration or secret manager.
 */
function getTransporter(): nodemailer.Transporter {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass }
    });
  }

  // Fallback to local logging/mocking if no credentials are set up
  console.log("[SMTP CONFIG] Missing SMTP environment variables. Defaulting to dry-run logging.");
  return {
    sendMail: async (options: any) => {
      console.log("[EMAIL DRY-RUN] sent mail payload:", JSON.stringify(options, null, 2));
      return { messageId: "mock-message-id" };
    }
  } as any;
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
          <img src="${imgUrl}" alt="${p.name}" style="width: 44px; height: 44px; object-fit: cover; border-radius: 8px; border: 1px solid #cbd5e1; margin-right: 12px; display: inline-block; vertical-align: middle;" />
          <span style="font-weight: 600; color: #1e293b; display: inline-block; vertical-align: middle;">${p.name}</span>
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
    <div style="background-color: #f8fafc; padding: 40px 16px; font-family: sans-serif; min-height: 100%;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; overflow: hidden; border: 1px solid #e2e8f0;">
        
        <!-- Header -->
        <div style="background-color: #00b853; padding: 32px 24px; text-align: center; color: #ffffff;">
          <h1 style="margin: 0; font-size: 26px; font-weight: 900; letter-spacing: -0.5px; text-transform: uppercase;">FreshNLocal Co.</h1>
          <p style="margin: 8px 0 0; font-size: 15px; font-weight: 500; opacity: 0.9;">Your Farm-Fresh Harvest is Confirmed!</p>
        </div>

        <!-- Body -->
        <div style="padding: 32px 24px;">
          <p style="margin: 0 0 20px; font-size: 16px; color: #334155;">Hello <strong>${order.shippingDetails?.name || 'Customer'}</strong>,</p>
          <p style="margin: 0 0 24px; font-size: 15px; color: #475569; line-height: 1.6;">
            Thank you for shopping local! Your order has been registered successfully. Our regional partners in Surat are harvesting your items fresh from the farm.
          </p>

          <!-- Order Summary -->
          <div style="background-color: #f1f5f9; padding: 20px; border-radius: 16px; margin-bottom: 24px; border: 1px solid #e2e8f0; font-size: 14px; color: #475569;">
            <table style="width: 100%;">
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
                <td style="padding: 4px 0; text-align: right; font-size: 13px;">${order.shippingDetails?.address || 'N/A'}</td>
              </tr>
            </table>
          </div>

          <!-- Items -->
          <h3 style="margin: 0 0 12px; font-size: 16px; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">Harvested Items</h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 24px;">
            <thead>
              <tr style="background-color: #f8fafc;">
                <th style="padding: 10px 12px; text-align: left; color: #475569; border-bottom: 1px solid #e2e8f0;">Product</th>
                <th style="padding: 10px 12px; text-align: center; color: #475569; border-bottom: 1px solid #e2e8f0;">Qty</th>
                <th style="padding: 10px 12px; text-align: right; color: #475569; border-bottom: 1px solid #e2e8f0;">Price</th>
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

          <div style="background-color: #f0fdf4; border: 1px dashed #bbf7d0; padding: 18px; border-radius: 16px; text-align: center;">
            <p style="margin: 0 0 8px; font-size: 14px; color: #166534; font-weight: bold;">🍳 Need Culinary Inspiration?</p>
            <p style="margin: 0; font-size: 13px; color: #14532d;">
              Ask <strong>Freshi AI Chef</strong> inside our app to design gorgeous gourmet recipes using your farm-fresh local veggies and exotics!
            </p>
          </div>
        </div>

        <!-- Footer -->
        <div style="background-color: #f1f5f9; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b;">
          <p style="margin: 0 0 4px; font-weight: bold;">FreshNLocal Co. — Surat, Gujarat</p>
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
  let statusColor = "#3b82f6";
  let statusMessage = "Your fresh crops are harvested, packed, and currently in transit to your kitchen!";
  
  if (isDelivered) {
    statusText = "Delivered";
    statusColor = "#00b853";
    statusMessage = "Your farm-fresh produce has been delivered! Enjoy the taste of raw, regional harvests.";
  } else if (isCancelled) {
    statusText = "Cancelled";
    statusColor = "#ef4444";
    statusMessage = "Your order was cancelled. Please reach out if we can assist you with a new order.";
  }

  return `
    <div style="background-color: #f8fafc; padding: 40px 16px; font-family: sans-serif; min-height: 100%;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; overflow: hidden; border: 1px solid #e2e8f0;">
        
        <!-- Header -->
        <div style="background-color: ${statusColor}; padding: 32px 24px; text-align: center; color: #ffffff;">
          <h1 style="margin: 0; font-size: 26px; font-weight: 900; letter-spacing: -0.5px; text-transform: uppercase;">FreshNLocal Co.</h1>
          <p style="margin: 8px 0 0; font-size: 15px; font-weight: 500; opacity: 0.9;">Order Update: ${statusText}</p>
        </div>

        <!-- Body -->
        <div style="padding: 32px 24px;">
          <p style="margin: 0 0 20px; font-size: 16px; color: #334155;">Hello <strong>${order.shippingDetails?.name || 'Customer'}</strong>,</p>
          <p style="margin: 0 0 24px; font-size: 15px; color: #475569; line-height: 1.6;">
            ${statusMessage}
          </p>

          <!-- Order Summary Card -->
          <div style="background-color: #f1f5f9; padding: 20px; border-radius: 16px; margin-bottom: 24px; border: 1px solid #e2e8f0; font-size: 14px; color: #475569;">
            <table style="width: 100%;">
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
                <td style="padding: 4px 0; text-align: right; font-size: 13px;">${order.shippingDetails?.address || 'N/A'}</td>
              </tr>
            </table>
          </div>

          <p style="margin: 0; font-size: 14px; color: #64748b; text-align: center;">
            Thank you for buying regional! We appreciate your commitment to organicRegional agriculture.
          </p>
        </div>

        <!-- Footer -->
        <div style="background-color: #f1f5f9; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b;">
          <p style="margin: 0; font-weight: bold;">FreshNLocal Co. — Surat, Gujarat</p>
        </div>
      </div>
    </div>
  `;
}

/**
 * Cloud Function Trigger: onOrderCreated
 * Runs automatically when a new document is created in the "orders" collection.
 * Sends the customer an automated Order Confirmation email.
 */
export const onOrderCreated = onDocumentCreated("orders/{orderId}", async (event) => {
  const snapshot = event.data;
  if (!snapshot) {
    console.log("No data associated with the order creation event.");
    return;
  }

  const orderId = event.params.orderId;
  const order = snapshot.data();
  const email = order.shippingDetails?.email;

  if (!email) {
    console.log(`Order ${orderId} does not contain an email address. Skipping email confirmation.`);
    return;
  }

  if (order.confirmationEmailSent) {
    console.log(`Confirmation email for order ${orderId} was already sent. Skipping.`);
    return;
  }

  console.log(`Triggering Order Confirmation email for order ${orderId} to: ${email}`);

  const transporter = getTransporter();
  const mailOptions = {
    from: process.env.SMTP_FROM || `"FreshNLocal Co." <freshnlocalco@gmail.com>`,
    to: email,
    subject: `🌾 FreshNLocal Co. — Order Confirmed: #${order.orderNumber || orderId}`,
    html: renderOrderConfirmationHtml(order, orderId)
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Order Confirmation email sent successfully to ${email}`);

    // Update document flag so it is recorded as sent
    await snapshot.ref.update({ confirmationEmailSent: true });
  } catch (err) {
    console.error(`Failed to send order confirmation to ${email}:`, err);
  }
});

/**
 * Cloud Function Trigger: onOrderStatusUpdated
 * Runs automatically when an order document is updated in the "orders" collection.
 * Checks if the order status transitioned away from "pending" and sends appropriate Shipping Update emails.
 */
export const onOrderStatusUpdated = onDocumentUpdated("orders/{orderId}", async (event) => {
  const change = event.data;
  if (!change) {
    console.log("No data associated with the order update event.");
    return;
  }

  const orderId = event.params.orderId;
  const beforeData = change.before.data();
  const afterData = change.after.data();

  const email = afterData.shippingDetails?.email;
  if (!email) {
    console.log(`Updated order ${orderId} has no email address. Skipping update email.`);
    return;
  }

  // Only trigger if status changed and is not pending, and we haven't sent the email for this specific status
  const statusChanged = beforeData.status !== afterData.status;
  const notPending = afterData.status !== "pending";
  const emailNotSentForStatus = afterData.shippingEmailStatus !== afterData.status;

  if (statusChanged && notPending && emailNotSentForStatus) {
    console.log(`Order status of ${orderId} updated from "${beforeData.status}" to "${afterData.status}". Sending Shipping Update to ${email}`);

    const transporter = getTransporter();
    const mailOptions = {
      from: process.env.SMTP_FROM || `"FreshNLocal Co." <freshnlocalco@gmail.com>`,
      to: email,
      subject: `🚚 FreshNLocal Co. — Order Update: ${afterData.status.toUpperCase()} (#${afterData.orderNumber || orderId})`,
      html: renderShippingUpdateHtml(afterData, orderId)
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log(`Order update email for status "${afterData.status}" successfully sent to ${email}`);

      // Sync the shippingEmailStatus flag with the current status
      await change.after.ref.update({ shippingEmailStatus: afterData.status });
    } catch (err) {
      console.error(`Failed to send order status update to ${email}:`, err);
    }
  }
});
