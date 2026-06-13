import { getConfig } from './config.js';

async function shopifyGraphql(query, variables = {}) {
  const { shopifyStore, shopifyAdminToken } = getConfig();

  if (!shopifyAdminToken) {
    console.error('SHOPIFY_ADMIN_TOKEN is not set');
    return null;
  }

  const res = await fetch(`https://${shopifyStore}/admin/api/2024-10/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': shopifyAdminToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    console.error('Shopify HTTP error', res.status, await res.text());
    return null;
  }

  return res.json();
}

export function hasVpTag(tags = []) {
  return tags.some((t) => String(t).toLowerCase() === 'vp');
}

export async function findCustomerByEmail(email) {
  const data = await shopifyGraphql(
    `query($q: String!) {
      customers(first: 1, query: $q) {
        nodes { id email tags }
      }
    }`,
    { q: `email:${email}` }
  );

  return data?.data?.customers?.nodes?.[0] || null;
}

async function createCustomer(email) {
  const data = await shopifyGraphql(
    `mutation($input: CustomerInput!) {
      customerCreate(input: $input) {
        customer { id email tags }
        userErrors { field message }
      }
    }`,
    {
      input: {
        email,
        tags: ['VP'],
      },
    }
  );

  const errors = data?.data?.customerCreate?.userErrors;
  if (errors?.length) {
    console.error('customerCreate errors', errors);
    return findCustomerByEmail(email);
  }

  return data?.data?.customerCreate?.customer || null;
}

async function tagsAdd(customerGid, tags) {
  const data = await shopifyGraphql(
    `mutation($id: ID!, $tags: [String!]!) {
      tagsAdd(id: $id, tags: $tags) {
        userErrors { field message }
      }
    }`,
    { id: customerGid, tags }
  );

  const errors = data?.data?.tagsAdd?.userErrors;
  if (errors?.length) {
    console.error('tagsAdd errors', errors);
    return false;
  }

  return true;
}

export async function customerHasVpAccess(email) {
  const customer = await findCustomerByEmail(email);
  return Boolean(customer && hasVpTag(customer.tags));
}

export async function ensureCustomerWithVpTag(email) {
  let customer = await findCustomerByEmail(email);

  if (!customer) {
    customer = await createCustomer(email);
    if (!customer) return { ok: false };
  }

  const alreadyHadTag = hasVpTag(customer.tags);

  if (!alreadyHadTag) {
    const tagged = await tagsAdd(customer.id, ['VP']);
    if (!tagged) return { ok: false };
  }

  return { ok: true, alreadyHadTag };
}
