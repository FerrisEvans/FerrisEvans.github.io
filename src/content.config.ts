import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';
import { articleMetadataErrors } from './utils/article-metadata.mjs';

const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
  error: 'Use lowercase letters, numbers, and hyphens, e.g. "machine-learning"',
});

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './posts' }),
  schema: z.preprocess((data, ctx) => {
    for (const { field, message } of articleMetadataErrors(data)) {
      ctx.addIssue({ code: 'custom', path: [field], message });
    }
    return data;
  }, z.object({
    key: z.string().regex(/^[A-Za-z0-9_-]+$/),
    title: z.string().min(1),
    description: z.string().optional(),
    date: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    category: slugSchema,
    subcategory: slugSchema.optional(),
    tags: z.array(z.string()).default([]),
    pin: z.boolean().default(false),
    draft: z.boolean().default(false),
    math: z.boolean().default(false),
  })),
});

export const collections = { blog };
