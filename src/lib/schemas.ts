import { z } from 'zod';

// 为豆瓣 categories 和 recommends API 的原始 item 定义 Schema
export const RawDoubanItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  
  // pic 对象可能为 null 或不存在
  pic: z.object({
    normal: z.string().optional(),
    large: z.string().optional(),
  }).nullable().optional(),
  
  // rating 对象可能为 null 或不存在，其内部的 value 也可能不存在
  rating: z.object({
    value: z.number().optional(),
  }).nullable().optional(),
  
  card_subtitle: z.string().optional(),
  year: z.string().optional(),
});

// 为豆瓣 search_subjects (通用列表) API 的原始 item 定义 Schema
export const RawDoubanSubjectSchema = z.object({
    id: z.string(),
    title: z.string(),
    cover: z.string().optional(),
    rate: z.string().optional(),
});

// 为 Bangumi 日历 API 的原始 item 定义 Schema
export const BangumiItemSchema = z.object({
  id: z.number(),
  name: z.string(),
  name_cn: z.string().optional().default(''), // 确保 name_cn 是可选的
  images: z.object({
    large: z.string().optional(),
    common: z.string().optional(),
    medium: z.string().optional(),
    small: z.string().optional(),
    grid: z.string().optional(),
  }).nullable().optional(), // images 对象本身可能是 null 或不存在
  rating: z.object({
    score: z.number().optional(),
  }).nullable().optional(), // rating 对象本身可能是 null 或不存在
  air_date: z.string().optional(),
});
