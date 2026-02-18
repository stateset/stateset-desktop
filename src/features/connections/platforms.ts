export interface Platform {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  requiredFields: { key: string; label: string; type: string }[];
  oauth?: {
    provider: 'shopify' | 'gorgias' | 'zendesk';
    label: string;
    fields: { key: string; label: string; type: string; placeholder?: string }[];
  };
}

export const PLATFORMS: Platform[] = [
  {
    id: 'shopify',
    name: 'Shopify',
    description: 'E-commerce platform for orders, products, and customers',
    icon: '🛍️',
    color: 'bg-green-600',
    requiredFields: [
      { key: 'shop_domain', label: 'Shop Domain', type: 'text' },
      { key: 'access_token', label: 'Access Token', type: 'password' },
    ],
    oauth: {
      provider: 'shopify',
      label: 'Connect with OAuth',
      fields: [
        {
          key: 'shop_domain',
          label: 'Shop Domain',
          type: 'text',
          placeholder: 'mystore.myshopify.com',
        },
      ],
    },
  },
  {
    id: 'gorgias',
    name: 'Gorgias',
    description: 'Customer support helpdesk for tickets and messaging',
    icon: '💬',
    color: 'bg-purple-600',
    requiredFields: [
      { key: 'domain', label: 'Gorgias Domain', type: 'text' },
      { key: 'api_key', label: 'API Key', type: 'password' },
      { key: 'email', label: 'Email', type: 'email' },
    ],
    oauth: {
      provider: 'gorgias',
      label: 'Connect with OAuth',
      fields: [
        {
          key: 'domain',
          label: 'Gorgias Domain',
          type: 'text',
          placeholder: 'your-domain',
        },
      ],
    },
  },
  {
    id: 'zendesk',
    name: 'Zendesk',
    description: 'Customer service and support ticketing system',
    icon: '🎫',
    color: 'bg-emerald-600',
    requiredFields: [
      { key: 'subdomain', label: 'Zendesk Subdomain', type: 'text' },
      { key: 'api_token', label: 'API Token', type: 'password' },
      { key: 'email', label: 'Email', type: 'email' },
    ],
    oauth: {
      provider: 'zendesk',
      label: 'Connect with OAuth',
      fields: [
        {
          key: 'subdomain',
          label: 'Zendesk Subdomain',
          type: 'text',
          placeholder: 'your-subdomain',
        },
      ],
    },
  },
  {
    id: 'recharge',
    name: 'Recharge',
    description: 'Subscription management and recurring billing',
    icon: '🔄',
    color: 'bg-blue-600',
    requiredFields: [{ key: 'api_key', label: 'API Key', type: 'password' }],
  },
  {
    id: 'klaviyo',
    name: 'Klaviyo',
    description: 'Email marketing and customer data platform',
    icon: '📧',
    color: 'bg-gray-700',
    requiredFields: [{ key: 'api_key', label: 'API Key', type: 'password' }],
  },
  {
    id: 'shipstation',
    name: 'ShipStation',
    description: 'Shipping and fulfillment management',
    icon: '📦',
    color: 'bg-amber-600',
    requiredFields: [
      { key: 'api_key', label: 'API Key', type: 'password' },
      { key: 'api_secret', label: 'API Secret', type: 'password' },
    ],
  },
];
