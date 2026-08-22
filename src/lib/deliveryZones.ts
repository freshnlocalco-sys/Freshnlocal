export interface DeliveryZone {
  pincode: string;
  areas: string[];
  mainArea: string;
  description?: string;
  isPopular?: boolean;
}

export interface SearchResultItem {
  id: string;
  title: string;
  subtitle: string;
  pincode: string;
  mainArea: string;
}

export const SERVICEABLE_ZONES: DeliveryZone[] = [
  {
    pincode: '395001',
    mainArea: 'Nanpura / Athwalines',
    areas: [
      'Nanpura',
      'Athwalines',
      'Athwa Gate',
      'Gopipura',
      'Majura Gate',
      'Government Medical College area',
      'Bhatar Road',
      'Timaliyawad'
    ],
    description: 'Nanpura, Athwalines, Athwa Gate, Gopipura, Majura Gate, Bhatar Road',
    isPopular: true,
  },
  {
    pincode: '395009',
    mainArea: 'Adajan',
    areas: ['Adajan', 'Adajan Gam', 'Palanpur', 'Palanpur Jakatnaka', 'Palanpur Patia', 'Palanpur Bus Station', 'Honey Park', 'LP Savani Road', 'Anand Mahal Road', 'Prime Arcade'],
    description: 'Adajan, Adajan Gam, Palanpur, Honey Park',
    isPopular: true,
  },
  {
    pincode: '395007',
    mainArea: 'Vesu',
    areas: ['Vesu', 'VIP Road', 'Athwa', 'Bharthana', 'Abhva', 'Athwalines', 'University Road', 'Reliance Mall Area', 'Shyam Mandir Area'],
    description: 'Vesu, Athwa, Bharthana, Abhva, Athwalines',
    isPopular: true,
  },
  {
    pincode: '395017',
    mainArea: 'Althan',
    areas: ['Althan', 'Bhimrad', 'Althan Canal Road', 'VIP Circle', 'Bhatar Road Extension', 'SMC Party Plot'],
    description: 'Althan, Bhimrad, Canal Road',
    isPopular: true,
  },
  {
    pincode: '395005',
    mainArea: 'Rander',
    areas: ['Rander', 'Jahangirpura', 'Palanpur Gam', 'Mora Bhagal', 'Navyug College area', 'Ramnagar', 'Gorat'],
    description: 'Rander, Jahangirpura, Palanpur',
    isPopular: true,
  },
  {
    pincode: '395004',
    mainArea: 'Katargam',
    areas: ['Katargam', 'Singanpor', 'Dabholi', 'Gotalawadi', 'Ved Road', 'Gajera Circle', 'Kiran Hospital Area'],
    description: 'Katargam, Singanpor, Dabholi',
    isPopular: true,
  },
  {
    pincode: '395006',
    mainArea: 'Varachha',
    areas: ['Varachha', 'Nana Varachha', 'Kapodra', 'Hirabaug', 'Mini Bazar', 'Baroda Pristage', 'Mota Varachha Bridge'],
    description: 'Varachha, Nana Varachha, Kapodra',
    isPopular: true,
  },
  {
    pincode: '395003',
    mainArea: 'Bhagal',
    areas: ['Bhagal', 'Chauta Bazar', 'Begampura', 'Surat Railway Station', 'Zampa Bazar', 'Kot Safil Road'],
    description: 'Bhagal, Chauta Bazar, Begampura',
  },
  {
    pincode: '395002',
    mainArea: 'Sagrampura',
    areas: ['Sagrampura', 'Salabatpura', 'Ring Road', 'Surat Textile Market', 'Rustampura', 'Kailash Nagar'],
    description: 'Sagrampura, Salabatpura, Ring Road',
  },
  {
    pincode: '395023',
    mainArea: 'Varachha Road / Bhestan',
    areas: ['Bhestan', 'Varachha Road', 'Puna', 'Puna Gam', 'Kumbharia', 'Bhestan Railway Station'],
    description: 'Bhestan, Varachha Road, Puna',
  },
  {
    pincode: '394210',
    mainArea: 'Udhna',
    areas: ['Udhna', 'Udhnagam', 'Udhna Teen Rasta', 'Laxmi Nagar', 'Udhna Main Road', 'Silicon Shoppers'],
    description: 'Udhna, Udhnagam',
    isPopular: true,
  },
  {
    pincode: '394220',
    mainArea: 'Pandesara',
    areas: ['Pandesara', 'Pandesara Gam', 'Bamroli Road', 'Vadod Gam', 'Tirupati Society'],
    description: 'Pandesara',
  },
  {
    pincode: '394013',
    mainArea: 'Pandesara GIDC',
    areas: ['Pandesara GIDC', 'Industrial Estate', 'GIDC Housing Board', 'Pandesara Bridge'],
    description: 'Pandesara GIDC (Industrial Estate)',
  },
  {
    pincode: '394518',
    mainArea: 'Bhatha',
    areas: ['Bhatha', 'Vesu Extension', 'Hazira Road', 'Ichhapore Road'],
    description: 'Bhatha, Vesu Extension',
  },
  {
    pincode: '394550',
    mainArea: 'Dumas',
    areas: ['Dumas', 'Surat Airport', 'Dumas Beach Road', 'Sultanabad', 'Silent Zone', 'Dumas Gam'],
    description: 'Dumas, Surat Airport',
  },
  {
    pincode: '394101',
    mainArea: 'Magdalla',
    areas: ['Magdalla', 'Udhna Magdalla Road', 'VR Mall area', 'Y-Junction', 'Magdalla Port'],
    description: 'Magdalla, Udhna Magdalla Road',
  },
];

export const SERVICEABLE_PINCODES = SERVICEABLE_ZONES.map(z => z.pincode);

/**
 * Check if a given 6-digit pincode is in our allowed delivery zones
 */
export function isPincodeServiceable(pincode: string | undefined | null): boolean {
  if (!pincode) return false;
  const cleanPin = pincode.trim().replace(/\D/g, '');
  return SERVICEABLE_PINCODES.includes(cleanPin);
}

/**
 * Get Zone details by Pincode
 */
export function getZoneByPincode(pincode: string | undefined | null): DeliveryZone | undefined {
  if (!pincode) return undefined;
  const cleanPin = pincode.trim().replace(/\D/g, '');
  return SERVICEABLE_ZONES.find(z => z.pincode === cleanPin);
}

/**
 * Search places/landmarks and return formatted results like Instamart
 */
export function searchPlaces(query: string): SearchResultItem[] {
  if (!query || !query.trim()) {
    // Return all main zones & popular areas
    const initial: SearchResultItem[] = [];
    SERVICEABLE_ZONES.forEach(zone => {
      zone.areas.slice(0, 2).forEach(area => {
        initial.push({
          id: `${zone.pincode}-${area}`,
          title: area,
          subtitle: `${area}, Surat - ${zone.pincode}`,
          pincode: zone.pincode,
          mainArea: zone.mainArea,
        });
      });
    });
    return initial;
  }

  const q = query.toLowerCase().trim();
  const results: SearchResultItem[] = [];

  SERVICEABLE_ZONES.forEach(zone => {
    // If pincode matches
    if (zone.pincode.includes(q)) {
      results.push({
        id: `${zone.pincode}-main`,
        title: zone.mainArea,
        subtitle: `${zone.description || zone.mainArea}, Surat - ${zone.pincode}`,
        pincode: zone.pincode,
        mainArea: zone.mainArea,
      });
    }

    // Match individual areas/landmarks
    zone.areas.forEach(area => {
      if (area.toLowerCase().includes(q) || zone.mainArea.toLowerCase().includes(q)) {
        // avoid exact duplicates
        if (!results.some(r => r.title.toLowerCase() === area.toLowerCase())) {
          results.push({
            id: `${zone.pincode}-${area}`,
            title: area,
            subtitle: `${area}, Surat - ${zone.pincode}`,
            pincode: zone.pincode,
            mainArea: zone.mainArea,
          });
        }
      }
    });
  });

  return results;
}
