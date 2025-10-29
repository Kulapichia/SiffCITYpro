/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react';
import { getShortDramaCategories, ShortDramaCategory } from '@/lib/shortdrama.client';

interface ShortDramaSelectorProps {
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  totalCategories?: number;
}

const ShortDramaSelector = ({
  selectedCategory,
  onCategoryChange,
  totalCategories,
}: ShortDramaSelectorProps) => {
  const [categories, setCategories] = useState<ShortDramaCategory[]>([]);
  const [loading, setLoading] = useState(true);

  // 获取分类数据
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setLoading(true);
        const response = await getShortDramaCategories();
        // 移除硬编码的“全部”分类，以匹配 page.tsx 的数据源和初始状态
        // 这样可以确保与父组件的数据期望完全一致
        setCategories(response);
      } catch (error) {
        console.error('获取短剧分类失败:', error);
        // 设置默认分类
        setCategories([
          { type_id: 1, type_name: '古装' },
          { type_id: 2, type_name: '现代' },
          { type_id: 3, type_name: '都市' },
          { type_id: 4, type_name: '言情' },
          { type_id: 5, type_name: '悬疑' },
          { type_id: 6, type_name: '喜剧' },
          { type_id: 7, type_name: '其他' },
        ]);
      } finally {
        setLoading(false);
      }
    };

    fetchCategories();
  }, []);

  if (loading) {
    // 加载骨架屏
    return (
      <div className="flex flex-wrap gap-2.5">
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={index}
            className="h-10 w-24 rounded-xl bg-gray-200 dark:bg-gray-800 animate-pulse"
          />
        ))}
      </div>
    );
  }

  // 组件主体渲染逻辑
  return (
    <div>
      {/* 标题和总数显示区域 */}
      <div className="flex items-center space-x-2.5 mb-4">
        <div className="flex-1"></div> {/* 占位符，保持与page.tsx布局一致的可能性 */}
        {totalCategories && totalCategories > 0 && (
          <span className="text-xs px-2.5 py-1 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 font-medium">
            {totalCategories} 个分类
          </span>
        )}
      </div>

      {/* 分类按钮列表 */}
      <div className="flex flex-wrap gap-2.5">
        {categories.map((category, index) => {
          const isActive = selectedCategory === category.type_id.toString();
          return (
            <button
              key={category.type_id}
              onClick={() => onCategoryChange(category.type_id.toString())}
              className={`group relative overflow-hidden rounded-xl px-5 py-2.5 text-sm font-medium transition-all duration-300 transform hover:scale-105 ${
                isActive
                  ? 'bg-gradient-to-r from-purple-500 via-purple-600 to-pink-500 text-white shadow-lg shadow-purple-500/40'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-2 border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-600 hover:shadow-md'
              }`}
              style={{
                // 关键：实现交错动画效果
                animation: `fadeInUp 0.3s ease-out ${index * 0.03}s both`,
              }}
            >
              {/* 激活状态的光泽效果 */}
              {isActive && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
              )}

              {/* 未激活状态的悬停背景 */}
              {!isActive && (
                <div className="absolute inset-0 bg-gradient-to-r from-purple-50 via-pink-50 to-purple-50 dark:from-purple-900/20 dark:via-pink-900/20 dark:to-purple-900/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              )}

              <span className="relative z-10">{category.type_name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ShortDramaSelector;
