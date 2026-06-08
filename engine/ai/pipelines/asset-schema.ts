import * as z from 'zod';

/** Declarative plan the director compiles from the conversation. */
export const AssetPlanSchema = z.object({
  images: z
    .array(
      z.object({
        variable: z.string().describe('JS identifier the code will reference, e.g. heroSprite'),
        prompt: z.string().describe('subject + composition; style comes from the style bible'),
        fileName: z.string().describe('file name with extension, e.g. hero.png'),
        category: z.enum(['sprites', 'background', 'images', 'scenes']),
      }),
    )
    .describe('images to generate; [] for none'),
  sfx: z.array(z.string()).describe('OpenGameArt sfx search queries; [] for none'),
  music: z.array(z.string()).describe('OpenGameArt music search queries; [] for none'),
  fonts: z
    .array(z.object({ family: z.string(), weights: z.array(z.number().int()).min(1) }))
    .describe('Google Fonts families; [] for none'),
});
export type AssetPlan = z.infer<typeof AssetPlanSchema>;
