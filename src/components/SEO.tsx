import React from 'react';
import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';

interface SEOProps {
  title?: string;
  description?: string;
  image?: string;
  type?: 'website' | 'article' | 'product';
}

export function SEO({
  title,
  description = "FreshNLocal Co. delivers premium quality, fresh, and organic farm-to-table fruits, vegetables, and cold-pressed juices responsibly sourced for you.",
  image = "https://images.pexels.com/photos/1132047/pexels-photo-1132047.jpeg?auto=compress&cs=tinysrgb&w=1200", // A premium default organic produce banner
  type = 'website'
}: SEOProps) {
  const { pathname } = useLocation();
  const siteName = "FreshNLocal Co.";
  const baseUrl = "https://www.freshnlocal.co";
  const canonicalUrl = `${baseUrl}${pathname}`;

  const fullTitle = title ? `${title} | ${siteName}` : `${siteName} - Premium Fresh Produce & Juices`;

  return (
    <Helmet>
      {/* Standard Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="description" content={description} />

      {/* OpenGraph / Facebook */}
      <meta property="og:type" content={type} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:site_name" content={siteName} />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
    </Helmet>
  );
}
