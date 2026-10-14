import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    category: z.enum(['programming-language', 'data-structures', 'game-dev', 'ai']),
    subcategory: z.string().optional(),
    tags: z.array(z.string()).default([]),
    pin: z.boolean().default(false),
    draft: z.boolean().default(false),
    math: z.boolean().default(false),
  }),
});

export const collections = { blog };
