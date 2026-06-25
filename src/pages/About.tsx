import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Phone, Mail, Instagram, Facebook } from 'lucide-react';

export function About() {
  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-16 md:py-24 w-full">
      <h1 className="text-4xl md:text-5xl font-sans font-black tracking-tight mb-16 text-foreground">
        About Us
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-24 text-sm mix-blend-multiply">
        
        {/* Collections Directory */}
        <div className="flex flex-col sm:flex-row gap-12 sm:gap-16">
          <div className="space-y-4">
            <h3 className="font-sans font-black tracking-widest text-foreground text-sm pb-2 border-none">Shop</h3>
            <ul className="space-y-3 font-semibold text-muted-foreground tracking-wider text-[11px] uppercase">
              <li>Indian Fruit</li>
              <li>Exotic Fruits</li>
              <li>Exotic Vegetables</li>
              <li>Herbs & Seasonings</li>
              <li>More Items</li>
            </ul>
          </div>

          <div className="space-y-4 pt-0">
            <h3 className="font-sans font-black tracking-widest text-[#f5f5f5] text-sm pb-2 border-none hidden sm:block select-none">-</h3>
            <ul className="space-y-3 font-semibold text-muted-foreground tracking-wider text-[11px] uppercase">
              <li>Fresh & Hygenic Cut, Fruit And Vegetable</li>
              <li>Imported / Super Exotic Vegetables</li>
              <li>Leafy Greens</li>
              <li>Frozen Items</li>
            </ul>
          </div>
        </div>

        {/* Contact Info */}
        <div className="space-y-8">
          <div>
            <h3 className="font-sans font-black text-foreground text-sm pb-4">Visit our store</h3>
            
            <div className="space-y-4 text-muted-foreground font-semibold leading-relaxed text-xs">
              <p className="flex items-start gap-3">
                <span>Gr Floor hall, Reva Dham Apartment,<br />Uma bhawan Crossroad, opp ashirwad palace,<br />bhatar, Surat , Gujarat, 395007</span>
              </p>
              <p className="flex items-center gap-3">
                <a href="mailto:freshnlocalco@gmail.com" className="hover:text-primary transition-colors flex items-center gap-2">
                  <Mail className="w-4 h-4 text-primary shrink-0 opacity-80" /> freshnlocalco@gmail.com
                </a>
              </p>
              <p className="flex items-center gap-3">
                <span className="flex items-center gap-2"><Phone className="w-4 h-4 text-primary shrink-0 opacity-80" /> 7284000881</span>
              </p>
            </div>
          </div>

          <div className="pt-4">
            <h3 className="font-sans font-black text-foreground text-sm pb-4">Follow us here</h3>
            <div className="flex items-center gap-4">
              <a href="https://www.instagram.com/freshnlocalco?igsh=MWlrcWFoNjBjYnh2Yg==" target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-full border border-border flex items-center justify-center hover:bg-primary/10 hover:border-primary hover:text-primary transition-all text-foreground">
                <Instagram className="w-4 h-4" />
              </a>
              <a href="https://m.facebook.com/freshnlocalco/" target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-full border border-border flex items-center justify-center hover:bg-blue-600/10 hover:border-blue-600 hover:text-blue-600 transition-all text-foreground">
                <Facebook className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-32 pt-8 border-t border-border/50 grid grid-cols-1 sm:grid-cols-3 gap-6 text-[10px] font-semibold text-muted-foreground tracking-wide">
        <Link to="/returns" className="hover:text-primary hover:underline cursor-pointer transition-colors block text-left">Returns & Refund Policy</Link>
        <span className="hover:text-primary hover:underline cursor-pointer transition-colors block sm:text-center text-left">Privacy Policy</span>
        <span className="hover:text-primary hover:underline cursor-pointer transition-colors block sm:text-right text-left">Shipping & Payment Policy</span>
      </div>
      
      <div className="mt-8 text-[10px] text-muted-foreground/60 tracking-wider font-semibold">
        Copyright {new Date().getFullYear()}.
      </div>
    </div>
  );
}
