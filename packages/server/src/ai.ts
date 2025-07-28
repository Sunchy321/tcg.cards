import OpenAI from 'openai';

import { config } from '@/config';

const openai = new OpenAI({
    apiKey:  config.openaiKey,
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
});

export default openai;
