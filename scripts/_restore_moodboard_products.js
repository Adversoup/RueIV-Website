#!/usr/bin/env node
require('dotenv').config();

const STORE = process.env.SHOPIFY_STORE || 'ruefour.myshopify.com';
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const API = `https://${STORE}/admin/api/2024-10/graphql.json`;

const LABELS = ['Hero', 'Detail 1', 'Detail 2', 'Accent 1', 'Accent 2', 'Texture'];

const BOARDS = [
  {
    title: 'Quiet Luxury Living Room',
    handle: 'quiet-luxury-living-room',
    roomTag: 'Living Room',
    styleTag: 'Quiet Luxury',
    shortName: 'Quiet Luxury',
    description: 'Warm neutrals, soft bouclé, and sculptural lighting — a serene retreat for modern living. Add this vibe to your cart and our team will curate a tailored selection for your project within 24–48 business hours.',
    colors: ['D4C5B0','E8DFD0','B8A896','C9BBA8','A69582','DDD3C4']
  },
  {
    title: 'Coastal Modern Bedroom',
    handle: 'coastal-modern-bedroom',
    roomTag: 'Bedroom',
    styleTag: 'Coastal Modern',
    shortName: 'Coastal Modern',
    description: 'Light linens, whitewashed textures, and ocean-inspired hues for effortless calm. Add this vibe to your cart and our team will curate a tailored selection for your project within 24–48 business hours.',
    colors: ['B8CDD6','D6E5EC','8FB3C2','A3C4D1','7BA1B2','C5DAE3']
  },
  {
    title: 'Industrial Loft Dining',
    handle: 'industrial-loft-dining',
    roomTag: 'Dining',
    styleTag: 'Industrial Loft',
    shortName: 'Industrial Loft',
    description: 'Raw materials meet refined craft — brass, leather, and statement wallpaper. Add this vibe to your cart and our team will curate a tailored selection for your project within 24–48 business hours.',
    colors: ['8C7B6B','A69585','6B5A4A','B5A494','7A695A','C4B3A3']
  },
  {
    title: 'Japandi Study',
    handle: 'japandi-study',
    roomTag: 'Study',
    styleTag: 'Japandi',
    shortName: 'Japandi Study',
    description: 'Minimalist forms, natural wood, and paper-inspired wallcoverings for focused serenity. Add this vibe to your cart and our team will curate a tailored selection for your project within 24–48 business hours.',
    colors: ['C8C0B0','DDD6C8','B0A898','E5DFD2','A09888','D2CBB8']
  },
  {
    title: 'Art Deco Lounge',
    handle: 'art-deco-lounge',
    roomTag: 'Lounge',
    styleTag: 'Art Deco',
    shortName: 'Art Deco Lounge',
    description: 'Rich velvets, geometric patterns, and statement lighting — glamour reimagined. Add this vibe to your cart and our team will curate a tailored selection for your project within 24–48 business hours.',
    colors: ['2C3E50','8E6F3E','1A252F','6B5530','3D5066','A68B5B']
  },
  {
    title: 'Mediterranean Terrace',
    handle: 'mediterranean-terrace',
    roomTag: 'Outdoor',
    styleTag: 'Mediterranean',
    shortName: 'Mediterranean',
    description: 'Terracotta tones, outdoor-rated fabrics, and sun-drenched warmth. Add this vibe to your cart and our team will curate a tailored selection for your project within 24–48 business hours.',
    colors: ['C4703F','E8B88A','A05A30','D4956A','8B4A25','F0CCA5']
  }
];

async function gql(query, variables = {}) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': TOKEN
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30000)
  });

  const data = await res.json();
  if (data.errors) {
    throw new Error(JSON.stringify(data.errors, null, 2));
  }
  return data;
}

function buildMedia(board) {
  return board.colors.map((color, i) => {
    const dims = i === 0 ? '1200x800' : (i < 3 ? '800x600' : '600x600');
    return {
      originalSource: `https://placehold.co/${dims}/${color}/FFFFFF/png?text=${encodeURIComponent(LABELS[i])}`,
      alt: `${board.shortName} ${LABELS[i]}`,
      mediaContentType: 'IMAGE'
    };
  });
}

async function findByHandle(handle) {
  const query = `query productByHandle($q: String!) {
    products(first: 1, query: $q) {
      nodes {
        id
        title
        handle
        status
        templateSuffix
        media(first: 20) { nodes { alt } }
      }
    }
  }`;
  const data = await gql(query, { q: `handle:${handle}` });
  return data.data.products.nodes[0] || null;
}

async function getOnlineStorePublicationId() {
  const query = `{
    publications(first: 20) {
      edges { node { id name } }
    }
  }`;
  const data = await gql(query);
  const edge = data.data.publications.edges.find((e) => e.node.name === 'Online Store');
  return edge?.node?.id || null;
}

async function ensurePublished(productId, publicationId) {
  const mutation = `mutation publishProduct($id: ID!, $input: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $input) {
      userErrors { field message }
    }
  }`;

  const data = await gql(mutation, {
    id: productId,
    input: [{ publicationId }]
  });

  const errors = data.data.publishablePublish.userErrors || [];
  if (errors.length) {
    throw new Error(JSON.stringify(errors, null, 2));
  }
}

async function createBoard(board) {
  const mutation = `mutation createBoard($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
    productCreate(product: $product, media: $media) {
      product {
        id
        title
        handle
        status
        templateSuffix
      }
      userErrors { field message }
    }
  }`;

  const product = {
    title: board.title,
    handle: board.handle,
    descriptionHtml: `<p>${board.description}</p><p><strong>Trade-only sourcing service.</strong> Add your preferred moodboard to cart and our team will respond with a curated product pull aligned to your project.</p>`,
    productType: 'Moodboard',
    vendor: 'Rue IV',
    tags: ['Moodboard', 'The Vibe Studio', board.roomTag, board.styleTag],
    templateSuffix: 'moodboard',
    status: 'ACTIVE'
  };

  const data = await gql(mutation, {
    product,
    media: buildMedia(board)
  });

  const payload = data.data.productCreate;
  if (payload.userErrors?.length) {
    throw new Error(JSON.stringify(payload.userErrors, null, 2));
  }
  return payload.product;
}

async function addMediaIfMissing(productId, board, existingMediaCount) {
  if (existingMediaCount > 0) return;

  const mutation = `mutation addMedia($productId: ID!, $media: [CreateMediaInput!]!) {
    productCreateMedia(productId: $productId, media: $media) {
      media { alt status }
      mediaUserErrors { field message }
    }
  }`;

  const data = await gql(mutation, { productId, media: buildMedia(board) });
  const errors = data.data.productCreateMedia.mediaUserErrors || [];
  if (errors.length) {
    throw new Error(JSON.stringify(errors, null, 2));
  }
}

async function main() {
  const publicationId = await getOnlineStorePublicationId();
  if (!publicationId) {
    throw new Error('Online Store publication not found');
  }

  for (const board of BOARDS) {
    const existing = await findByHandle(board.handle);

    if (existing) {
      console.log(`EXISTS  ${board.handle} → ${existing.title} [template=${existing.templateSuffix || 'none'}]`);
      await addMediaIfMissing(existing.id, board, existing.media.nodes.length);
      await ensurePublished(existing.id, publicationId);
      console.log(`PUBLISHED ${board.handle} → Online Store`);
      continue;
    }

    const created = await createBoard(board);
    console.log(`CREATED ${created.handle} → ${created.title} [template=${created.templateSuffix}]`);
    await ensurePublished(created.id, publicationId);
    console.log(`PUBLISHED ${created.handle} → Online Store`);
  }

  console.log('DONE');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
