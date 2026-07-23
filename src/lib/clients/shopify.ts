import { env } from "@/lib/env";
import { fetchWithRetry } from "./http";

/**
 * Shopify Admin GraphQL client (2025-10). Products, variants, media, and
 * sales-channel publication. Checkout/cart/payments/tax stay Shopify's
 * problem — none of that is our code.
 */

const API_VERSION = "2025-10";

export const SIZES = ["S", "M", "L", "XL", "2XL"] as const;

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

async function graphql<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const res = await fetchWithRetry(
    "shopify",
    `https://${env("SHOPIFY_STORE_DOMAIN")}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": env("SHOPIFY_ADMIN_TOKEN"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    },
    { attempts: 4, backoffMs: 1500 }
  );
  const json = (await res.json()) as GraphQLResponse<T>;
  if (json.errors?.length) {
    throw new Error(`shopify: ${json.errors.map((e) => e.message).join("; ")}`);
  }
  if (!json.data) throw new Error("shopify: response had no data");
  return json.data;
}

function assertNoUserErrors(
  operation: string,
  userErrors: Array<{ field?: string[] | null; message: string }> | undefined
): void {
  if (userErrors && userErrors.length > 0) {
    throw new Error(
      `shopify ${operation}: ${userErrors.map((e) => e.message).join("; ")}`
    );
  }
}

export async function createProduct(input: {
  title: string;
  descriptionHtml: string;
  handle: string;
}): Promise<{ productId: string; handle: string }> {
  const data = await graphql<{
    productCreate: {
      product: { id: string; handle: string } | null;
      userErrors: Array<{ message: string }>;
    };
  }>(
    `mutation CreateProduct($product: ProductCreateInput!) {
      productCreate(product: $product) {
        product { id handle }
        userErrors { field message }
      }
    }`,
    {
      product: {
        title: input.title,
        descriptionHtml: input.descriptionHtml,
        handle: input.handle,
        status: "ACTIVE",
        productOptions: [
          { name: "Size", values: SIZES.map((name) => ({ name })) },
        ],
      },
    }
  );
  assertNoUserErrors("productCreate", data.productCreate.userErrors);
  if (!data.productCreate.product) throw new Error("shopify: productCreate returned no product");
  return {
    productId: data.productCreate.product.id,
    handle: data.productCreate.product.handle,
  };
}

export async function createSizeVariants(input: {
  productId: string;
  priceCents: number;
}): Promise<Array<{ id: string; title: string }>> {
  const price = (input.priceCents / 100).toFixed(2);
  const data = await graphql<{
    productVariantsBulkCreate: {
      productVariants: Array<{ id: string; title: string }> | null;
      userErrors: Array<{ message: string }>;
    };
  }>(
    `mutation CreateVariants($productId: ID!, $variants: [ProductVariantsBulkInput!]!, $strategy: ProductVariantsBulkCreateStrategy) {
      productVariantsBulkCreate(productId: $productId, variants: $variants, strategy: $strategy) {
        productVariants { id title }
        userErrors { field message }
      }
    }`,
    {
      productId: input.productId,
      strategy: "REMOVE_STANDALONE_VARIANT",
      variants: SIZES.map((size) => ({
        price,
        optionValues: [{ optionName: "Size", name: size }],
      })),
    }
  );
  assertNoUserErrors("productVariantsBulkCreate", data.productVariantsBulkCreate.userErrors);
  return data.productVariantsBulkCreate.productVariants ?? [];
}

export async function attachProductImage(input: {
  productId: string;
  imageUrl: string;
  alt: string;
}): Promise<string> {
  const data = await graphql<{
    productCreateMedia: {
      media: Array<{ id: string }> | null;
      mediaUserErrors: Array<{ message: string }>;
    };
  }>(
    `mutation AttachImage($productId: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $productId, media: $media) {
        media { id }
        mediaUserErrors { field message }
      }
    }`,
    {
      productId: input.productId,
      media: [
        { originalSource: input.imageUrl, alt: input.alt, mediaContentType: "IMAGE" },
      ],
    }
  );
  assertNoUserErrors("productCreateMedia", data.productCreateMedia.mediaUserErrors);
  return data.productCreateMedia.media?.[0]?.id ?? "";
}

/** Sales channels we publish to; matched by publication name. */
export const TARGET_CHANNELS = ["Online Store", "Facebook & Instagram"] as const;

export async function findPublicationIds(): Promise<
  Array<{ id: string; name: string }>
> {
  const data = await graphql<{
    publications: { nodes: Array<{ id: string; name: string }> };
  }>(
    `query Publications {
      publications(first: 20) { nodes { id name } }
    }`,
    {}
  );
  return data.publications.nodes.filter((p) =>
    (TARGET_CHANNELS as readonly string[]).some(
      (target) => p.name.toLowerCase() === target.toLowerCase()
    )
  );
}

export async function publishToChannels(input: {
  productId: string;
  publicationIds: string[];
}): Promise<void> {
  const data = await graphql<{
    publishablePublish: { userErrors: Array<{ message: string }> };
  }>(
    `mutation Publish($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) {
        userErrors { field message }
      }
    }`,
    {
      id: input.productId,
      input: input.publicationIds.map((publicationId) => ({ publicationId })),
    }
  );
  assertNoUserErrors("publishablePublish", data.publishablePublish.userErrors);
}
