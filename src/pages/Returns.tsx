import React from 'react';

export function Returns() {
  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-16 md:py-24 w-full">
      <h1 className="text-4xl md:text-5xl font-sans font-black tracking-tight mb-16 text-foreground">
        Returns & Refund Policy
      </h1>

      <div className="prose prose-sm max-w-none text-muted-foreground font-medium leading-relaxed">
        <p className="mb-8 text-base text-foreground/90 font-semibold">
          FreshNLocal.CO delivers fresh, perishable produce, so our policy is built 
          around the quality and condition of items at the time of delivery.
        </p>

        <h3 className="font-sans font-black text-foreground text-xl mb-4 mt-12">Damaged or Defective Items</h3>
        <p className="mb-6">
          If any item arrives spoiled, damaged, or not of acceptable quality, we will 
          replace it or refund it. Please report the issue within 24 hours of delivery 
          (same day preferred), and include a photo of the affected item where possible.
        </p>

        <h3 className="font-sans font-black text-foreground text-xl mb-4 mt-12">How to Report an Issue</h3>
        <p className="mb-2">Contact us with your order number and details:</p>
        <ul className="mb-6 list-none pl-0 space-y-2">
          <li><strong>WhatsApp / Phone:</strong> +91 7284000881</li>
          <li><strong>Email:</strong> <a href="mailto:freshnlocalco@gmail.com" className="text-primary hover:underline">freshnlocalco@gmail.com</a></li>
        </ul>

        <h3 className="font-sans font-black text-foreground text-xl mb-4 mt-12">Refunds & Replacements</h3>
        <p className="mb-6">
          Once your report is verified, we will arrange a replacement with your next 
          delivery or issue a refund to your original payment method within 5–7 
          business days.
        </p>

        <h3 className="font-sans font-black text-foreground text-xl mb-4 mt-12">Non-Defective Returns</h3>
        <p className="mb-6">
          Because our products are fresh and perishable, we are unable to accept returns 
          or exchanges for reasons other than product quality (for example, change of 
          mind after delivery).
        </p>

        <h3 className="font-sans font-black text-foreground text-xl mb-4 mt-12">Exchanges</h3>
        <p className="mb-6">
          We do not offer exchanges, but we will always make right any genuine quality 
          issue as described above.
        </p>

        <h3 className="font-sans font-black text-foreground text-xl mb-4 mt-12">Contact</h3>
        <p className="mb-6">
          <strong>FreshNLocal.CO</strong><br />
          Gr Floor Hall, Reva Dham Apartment, Uma Bhawan Crossroad, Opp. Ashirwad Palace, Bhatar, Surat, Gujarat<br />
          <strong>Email:</strong> <a href="mailto:freshnlocalco@gmail.com" className="text-primary hover:underline">freshnlocalco@gmail.com</a><br />
          <strong>Phone:</strong> +91 7284000881
        </p>
      </div>
    </div>
  );
}
