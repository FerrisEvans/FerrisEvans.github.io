import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
  error: 'Use lowercase letters, numbers, and hyphens, e.g. "machine-learning"',
});

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    category: slugSchema,
    subcategory: slugSchema.optional(),
    tags: z.array(z.string()).default([]),
    pin: z.boolean().default(false),
    draft: z.boolean().default(false),
    math: z.boolean().default(false),
  }),
});

export const collections = { blog };
