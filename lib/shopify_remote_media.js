/**
 * shopify_remote_media.js
 * Remote media attach for bounded AF demo sync:
 *   1) productCreateMedia with originalSource (Shopify fetches authoritative URL)
 *   2) poll media status until READY or FAILED
 *   3) automatic fallback: server-side fetch + stagedUploadsCreate → productCreateMedia
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { gqlFetch, sleep } = require('./shopify_admin');
const { normalizeImageUrl } = require('./hub_shopify_mapper');
const { isLocalMediaUrl, localPathFromMediaUrl } = require('./hub_media_resolver');

const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_POLL_MAX_ATTEMPTS = 30;

const MEDIA_CREATE_MUTATION = `
  mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
    productCreateMedia(productId: $productId, media: $media) {
      media {
        ... on MediaImage {
          id
          status
          alt
          image { url }
        }
      }
      mediaUserErrors { field message code }
    }
  }
`;

const PRODUCT_MEDIA_QUERY = `
  query productMediaStatus($id: ID!, $first: Int!) {
    product(id: $id) {
      id
      media(first: $first) {
        edges {
          node {
            ... on MediaImage {
              id
              status
              alt
              mediaErrors { message code details }
              image { url }
            }
          }
        }
      }
    }
  }
`;

function extensionFromUrl(url, contentType) {
  const pathMatch = (url || '').match(/\.(jpe?g|png|webp|gif)(?:$|\?)/i);
  if (pathMatch) return pathMatch[1].toLowerCase().replace('jpeg', 'jpg');
  if (contentType?.includes('png')) return 'png';
  if (contentType?.includes('webp')) return 'webp';
  if (contentType?.includes('gif')) return 'gif';
  return 'jpg';
}

function mimeFromExtension(ext) {
  switch (ext) {
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'gif': return 'image/gif';
    default: return 'image/jpeg';
  }
}

async function readLocalImageBuffer(url) {
  const localPath = localPathFromMediaUrl(url);
  if (!localPath) {
    throw new Error(`Local media path not found for ${url}`);
  }
  const buffer = fs.readFileSync(localPath);
  if (buffer.length < 512) {
    throw new Error(`Local media too small (${buffer.length} bytes) for ${localPath}`);
  }
  const ext = path.extname(localPath).slice(1).toLowerCase() || 'jpg';
  return {
    buffer,
    contentType: mimeFromExtension(ext),
    normalizedUrl: url,
    localPath,
  };
}

async function fetchRemoteImageBuffer(url) {
  if (isLocalMediaUrl(url)) {
    return readLocalImageBuffer(url);
  }

  const normalized = normalizeImageUrl(url);
  const resp = await fetch(normalized, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; RueIV-MediaProxy/1.0; +https://github.com/Adversoup/RueIV-Website)',
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      Referer: 'https://www.artisticframe.com/',
    },
    redirect: 'follow',
  });

  if (!resp.ok) {
    throw new Error(`Remote fetch HTTP ${resp.status} for ${normalized}`);
  }

  const contentType = resp.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    throw new Error(`Remote fetch returned HTML (blocked or missing) for ${normalized}`);
  }

  const buffer = Buffer.from(await resp.arrayBuffer());
  if (buffer.length < 512) {
    throw new Error(`Remote fetch too small (${buffer.length} bytes) for ${normalized}`);
  }

  return { buffer, contentType, normalizedUrl: normalized };
}

async function stageUploadProductImage(buffer, filename, mimeType) {
  const query = `
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters { name value }
        }
        userErrors { field message }
      }
    }
  `;

  const stageResult = await gqlFetch(query, {
    input: [{
      filename,
      mimeType,
      httpMethod: 'POST',
      resource: 'PRODUCT_IMAGE',
      fileSize: String(buffer.length),
    }],
  });

  const targets = stageResult.data?.stagedUploadsCreate?.stagedTargets;
  const stageErrors = stageResult.data?.stagedUploadsCreate?.userErrors;
  if (stageErrors?.length) {
    throw new Error(`stagedUploadsCreate failed: ${JSON.stringify(stageErrors)}`);
  }
  if (!targets?.length) {
    throw new Error('stagedUploadsCreate returned no staged target');
  }

  const target = targets[0];
  const form = new FormData();
  for (const param of target.parameters) {
    form.append(param.name, param.value);
  }
  const blob = new Blob([buffer], { type: mimeType });
  form.append('file', blob, filename);

  const uploadResp = await fetch(target.url, { method: 'POST', body: form });
  if (!uploadResp.ok) {
    const text = await uploadResp.text();
    throw new Error(`Staged upload POST failed ${uploadResp.status}: ${text.slice(0, 200)}`);
  }

  return target.resourceUrl;
}

async function createProductMedia(productId, sources, options = {}) {
  const media = sources.map((entry, index) => ({
    alt: entry.alt || `Image ${index + 1}`,
    mediaContentType: 'IMAGE',
    originalSource: entry.originalSource,
  }));

  const result = await gqlFetch(MEDIA_CREATE_MUTATION, { productId, media });
  const userErrors = result?.data?.productCreateMedia?.mediaUserErrors || [];
  if (userErrors.length) {
    throw new Error(`productCreateMedia userErrors: ${JSON.stringify(userErrors)}`);
  }

  const created = result?.data?.productCreateMedia?.media || [];
  return created.map((m, index) => ({
    id: m.id,
    status: m.status || 'UPLOADED',
    alt: m.alt || media[index]?.alt,
    imageUrl: m.image?.url || null,
    originalSource: sources[index]?.originalSource,
    sourceUrl: sources[index]?.sourceUrl || sources[index]?.originalSource,
    attachMethod: sources[index]?.attachMethod || 'remote_original_source',
  }));
}

async function getProductMediaStatus(productId, mediaIds = null) {
  const first = Math.max(20, mediaIds?.length || 20);
  const result = await gqlFetch(PRODUCT_MEDIA_QUERY, { id: productId, first });
  const edges = result?.data?.product?.media?.edges || [];
  const nodes = edges.map((e) => e.node).filter(Boolean);

  if (!mediaIds?.length) return nodes;
  const idSet = new Set(mediaIds);
  return nodes.filter((n) => idSet.has(n.id));
}

async function pollProductMediaUntilSettled(productId, mediaIds, options = {}) {
  const intervalMs = options.intervalMs || DEFAULT_POLL_INTERVAL_MS;
  const maxAttempts = options.maxAttempts || DEFAULT_POLL_MAX_ATTEMPTS;
  const onTick = options.onTick || null;

  const terminal = new Set(['READY', 'FAILED']);
  let lastSnapshot = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    lastSnapshot = await getProductMediaStatus(productId, mediaIds);
    const statuses = lastSnapshot.map((m) => m.status);
    const allTerminal = statuses.length > 0 && statuses.every((s) => terminal.has(s));

    if (onTick) {
      onTick({ attempt, statuses, media: lastSnapshot });
    }

    if (allTerminal) {
      return {
        ok: lastSnapshot.every((m) => m.status === 'READY'),
        attempts: attempt,
        media: lastSnapshot.map((m) => ({
          id: m.id,
          status: m.status,
          alt: m.alt,
          imageUrl: m.image?.url || null,
          errors: (m.mediaErrors || []).map((e) => ({ message: e.message, code: e.code, details: e.details })),
        })),
      };
    }

    await sleep(intervalMs);
  }

  return {
    ok: false,
    attempts: maxAttempts,
    timedOut: true,
    media: lastSnapshot.map((m) => ({
      id: m.id,
      status: m.status,
      alt: m.alt,
      imageUrl: m.image?.url || null,
      errors: (m.mediaErrors || []).map((e) => ({ message: e.message, code: e.code, details: e.details })),
    })),
  };
}

async function attachRemoteProductImages(productId, imageUrls, options = {}) {
  const allowProxyFallback = options.allowProxyFallback !== false;
  const pollOptions = {
    intervalMs: options.pollIntervalMs || DEFAULT_POLL_INTERVAL_MS,
    maxAttempts: options.pollMaxAttempts || DEFAULT_POLL_MAX_ATTEMPTS,
    onTick: options.onPollTick || null,
  };

  const normalizedUrls = [...new Set((imageUrls || []).map((url) => (
    isLocalMediaUrl(url) ? url : normalizeImageUrl(url)
  )).filter(Boolean))];
  if (!normalizedUrls.length) {
    return {
      ok: true,
      attachMethod: 'none',
      created: [],
      poll: null,
      errors: [],
    };
  }

  const localUrls = normalizedUrls.filter(isLocalMediaUrl);
  const remoteUrls = normalizedUrls.filter((url) => !isLocalMediaUrl(url));

  const remoteSources = remoteUrls.map((url, index) => ({
    alt: options.altPrefix ? `${options.altPrefix} ${index + 1}` : `Image ${index + 1}`,
    originalSource: url,
    sourceUrl: url,
    attachMethod: 'remote_original_source',
  }));

  let created = [];
  if (remoteSources.length) {
    try {
      created = await createProductMedia(productId, remoteSources);
    } catch (err) {
      if (!allowProxyFallback) {
        return {
          ok: false,
          attachMethod: 'remote_original_source',
          created: [],
          poll: null,
          errors: [{ stage: 'create', message: err.message, urls: remoteUrls }],
        };
      }
      created = [];
    }
  }

  let poll = created.length
    ? await pollProductMediaUntilSettled(productId, created.map((m) => m.id), pollOptions)
    : { ok: false, media: [], attempts: 0 };

  const failedRemote = poll.media?.filter((m) => m.status === 'FAILED') || [];
  const urlsNeedingProxy = [...failedRemote.map((_, i) => remoteUrls[i]).filter(Boolean)];
  if (!poll.ok && remoteUrls.length && urlsNeedingProxy.length === 0) {
    urlsNeedingProxy.push(...remoteUrls);
  }
  const needsProxy = localUrls.length > 0 || !poll.ok || failedRemote.length > 0 || (remoteUrls.length > 0 && created.length === 0);

  if (!needsProxy || !allowProxyFallback) {
    return {
      ok: poll.ok,
      attachMethod: 'remote_original_source',
      created,
      poll,
      errors: failedRemote.flatMap((m) => m.errors || []),
    };
  }

  const proxyResults = [];
  const proxyErrors = [];
  const proxyCreated = [];

  const proxyTargets = [...new Set([...localUrls, ...urlsNeedingProxy])];
  for (let index = 0; index < proxyTargets.length; index++) {
    const url = proxyTargets[index];
    try {
      const { buffer, contentType, localPath } = await fetchRemoteImageBuffer(url);
      const ext = extensionFromUrl(localPath || url, contentType);
      const mimeType = mimeFromExtension(ext);
      const filename = `af-demo-${options.sku || 'product'}-${index + 1}.${ext}`;
      const resourceUrl = await stageUploadProductImage(buffer, filename, mimeType);
      const [mediaNode] = await createProductMedia(productId, [{
        alt: options.altPrefix ? `${options.altPrefix} ${index + 1}` : `Image ${index + 1}`,
        originalSource: resourceUrl,
        sourceUrl: url,
        attachMethod: 'proxy_staged_upload',
      }]);
      proxyCreated.push(mediaNode);
      proxyResults.push({
        url,
        method: localPath ? 'local_staged_upload' : 'proxy_staged_upload',
        mediaId: mediaNode.id,
        localPath: localPath || null,
      });
    } catch (err) {
      proxyErrors.push({ url, stage: 'proxy', message: err.message });
    }
  }

  if (!proxyCreated.length) {
    return {
      ok: false,
      attachMethod: 'remote_original_source+proxy_failed',
      created,
      poll,
      proxy: { created: [], errors: proxyErrors },
      errors: [
        ...(failedRemote.flatMap((m) => m.errors || [])),
        ...proxyErrors,
      ],
      blocker: proxyErrors.length
        ? 'Artistic Frame remote URLs blocked for both Shopify egress and server-side proxy fetch'
        : 'Remote media attach failed with no recoverable proxy path',
    };
  }

  const proxyPoll = await pollProductMediaUntilSettled(
    productId,
    proxyCreated.map((m) => m.id),
    pollOptions
  );

  return {
    ok: proxyPoll.ok,
    attachMethod: created.length ? 'remote_then_proxy_fallback' : 'proxy_staged_upload',
    created: [...created, ...proxyCreated],
    poll: proxyPoll,
    proxy: { created: proxyResults, errors: proxyErrors },
    errors: [
      ...(failedRemote.flatMap((m) => m.errors || [])),
      ...proxyErrors,
      ...(proxyPoll.media || []).filter((m) => m.status === 'FAILED').flatMap((m) => m.errors || []),
    ],
    blocker: proxyPoll.ok
      ? null
      : 'Shopify media processing failed after proxy staged upload',
  };
}

module.exports = {
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_POLL_MAX_ATTEMPTS,
  attachRemoteProductImages,
  createProductMedia,
  pollProductMediaUntilSettled,
  getProductMediaStatus,
  fetchRemoteImageBuffer,
  readLocalImageBuffer,
  stageUploadProductImage,
};
