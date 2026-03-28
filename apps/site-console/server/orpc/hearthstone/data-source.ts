import { os } from '@orpc/server';
import { z } from 'zod';

const DataSourceStateSchema = z.object({
  tag:        z.string().optional(),
  commit:     z.string().optional(),
  short:      z.string().optional(),
  synced_at:  z.string().optional(),
  type:       z.string().optional(),
  file_count: z.number().optional(),
  history:    z.array(z.object({
    tag:    z.string(),
    commit: z.string(),
    type:   z.string(),
    date:   z.string(),
    count:  z.number().optional(),
    size:   z.number().optional(),
  })).optional(),
});

const getState = os
  .route({
    method:      'GET',
    description: 'Get hsdata sync state from R2',
    tags:        ['Console', 'Hearthstone', 'DataSource'],
  })
  .input(z.void())
  .output(DataSourceStateSchema.nullable())
  .handler(async () => {
    try {
      // Fetch state.json from R2
      const stateUrl = `https://${process.env.DATA_ENDPOINT?.replace('https://', '')}/hearthstone/hsdata/state.json`;

      const response = await fetch(stateUrl, {
        headers: {
          Authorization: `Bearer ${process.env.DATA_ACCESS_KEY_ID}:${process.env.DATA_SECRET_ACCESS_KEY}`,
        },
      });

      if (!response.ok) {
        // Try public URL if authenticated fails
        const publicUrl = process.env.DATA_PUBLIC_URL
          ? `${process.env.DATA_PUBLIC_URL}/hearthstone/hsdata/state.json`
          : null;

        if (publicUrl) {
          const publicResponse = await fetch(publicUrl);
          if (publicResponse.ok) {
            return await publicResponse.json();
          }
        }
        return null;
      }

      return await response.json();
    } catch {
      return null;
    }
  })
  .callable();

const listFiles = os
  .route({
    method:      'GET',
    description: 'List hsdata files from R2',
    tags:        ['Console', 'Hearthstone', 'DataSource'],
  })
  .input(z.void())
  .output(z.array(z.object({
    name: z.string(),
    size: z.number(),
    time: z.string().optional(),
  })))
  .handler(async () => {
    try {
      // List files from R2 using S3 API
      const endpoint = process.env.DATA_ENDPOINT;
      const bucket = process.env.DATA_BUCKET_NAME;
      const accessKey = process.env.DATA_ACCESS_KEY_ID;
      const secretKey = process.env.DATA_SECRET_ACCESS_KEY;

      if (!endpoint || !bucket || !accessKey || !secretKey) {
        return [];
      }

      // Use rclone to list files
      const { execSync } = await import('child_process');
      const result = execSync(
        `rclone lsjson "r2:${bucket}/hearthstone/hsdata/data/" 2>/dev/null || echo "[]"`,
        { encoding: 'utf-8', timeout: 30000 },
      );

      const files = JSON.parse(result) as Array<{
        Name:     string;
        Size:     number;
        ModTime?: string;
      }>;

      return files.map(f => ({
        name: f.Name,
        size: f.Size,
        time: f.ModTime,
      }));
    } catch {
      return [];
    }
  })
  .callable();

export const dataSourceTrpc = {
  getState,
  listFiles,
};
