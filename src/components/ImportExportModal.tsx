'use client';

// 从lucide-react导入了更多图标，用于显示不同的文件格式
import { AlertCircle, CheckCircle, Download, FileJson, FileText, Sheet, Upload, X } from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';

// 接口定义保持不变
interface ImportResult {
  success: number;
  failed: number;
  skipped: number;
  details: Array<{
    name: string;
    key: string;
    status: 'success' | 'failed' | 'skipped';
    reason?: string;
  }>;
}

// 为强大的导出功能定义类型
type ExportFormat = 'json' | 'csv' | 'text';
type ExportScope = 'all' | 'selected' | 'filtered';

// 增强了Props接口，以接收和处理新的导出选项
interface ImportExportModalProps {
  isOpen: boolean;
  mode: 'import' | 'export' | 'result';
  onClose: () => void;
  onImport?: (
    file: File,
    onProgress?: (current: number, total: number) => void
  ) => Promise<ImportResult>;
  // onExport现在可以接收格式和范围参数
  onExport?: (format: ExportFormat, scope: ExportScope) => void;
  result?: ImportResult;
  // 导出功能所需的所有props
  exportScope?: ExportScope;
  setExportScope?: (scope: ExportScope) => void;
  exportFormat?: ExportFormat;
  setExportFormat?: (format: ExportFormat) => void;
  totalCount?: number;
  selectedCount?: number;
  filteredCount?: number;
}

export default function ImportExportModal({
  isOpen,
  mode,
  onClose,
  onImport,
  onExport,
  result,
  // 为新增的props提供默认值，增强组件的健壮性
  exportScope = 'all',
  setExportScope = () => {},
  exportFormat = 'json',
  setExportFormat = () => {},
  totalCount = 0,
  selectedCount = 0,
  filteredCount = 0,
}: ImportExportModalProps) {
  // 内部状态变量保持不变
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importProgress, setImportProgress] = useState({
    current: 0,
    total: 0,
  });

  if (!isOpen) return null;

  // 增强文件选择逻辑，以支持多种导入格式
  const handleFileSelect = async (file: File) => {
    // 支持 json, csv, 和 txt 格式，而不仅仅是 json
    if (!['.json', '.csv', '.txt'].some(ext => file.name.endsWith(ext))) {
      alert('请选择 JSON, CSV, 或 TXT 格式的文件');
      return;
    }

    setIsProcessing(true);
    setImportProgress({ current: 0, total: 0 });

    try {
      if (onImport) {
        await onImport(file, (current, total) => {
          setImportProgress({ current, total });
        });
      }
    } finally {
      setIsProcessing(false);
      setImportProgress({ current: 0, total: 0 });
    }
  };

  // 拖放处理函数保持不变
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const modalContent = (
    <div className='fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4'>
      <div className='bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden'>
        {/* 头部 - 更紧凑的设计 */}
        <div
          className={`relative px-5 py-4 ${
            mode === 'import'
              ? 'bg-gradient-to-r from-blue-600 to-cyan-600'
              : mode === 'export'
              ? 'bg-gradient-to-r from-green-600 to-emerald-600'
              : result && result.failed > 0
              ? 'bg-gradient-to-r from-yellow-600 to-orange-600'
              : 'bg-gradient-to-r from-green-600 to-emerald-600'
          }`}
        >
          <div className='flex items-center justify-between'>
            <div className='flex items-center space-x-3'>
              <div className='bg-white/20 backdrop-blur-sm p-2 rounded-lg'>
                {mode === 'import' ? (
                  <Upload className='w-5 h-5 text-white' />
                ) : (
                  <Download className='w-5 h-5 text-white' />
                )}
              </div>
              <div>
                <h2 className='text-lg font-bold text-white'>
                  {mode === 'import'
                    ? '导入视频源'
                    : mode === 'export'
                    ? '导出视频源'
                    : '导入结果'}
                </h2>
                <p className='text-white/80 text-xs mt-0.5'>
                  {mode === 'import'
                    ? isProcessing && importProgress.total > 0
                      ? `正在导入 ${importProgress.current}/${importProgress.total}`
                      : '从文件导入配置' // 文本微调
                    : mode === 'export'
                    ? '导出为多种格式的文件' // 文本微调
                    : '查看导入详情'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isProcessing}
              className={`text-white/80 hover:text-white hover:bg-white/20 p-1.5 rounded-lg transition-all ${
                isProcessing ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <X className='w-5 h-5' />
            </button>
          </div>

          {/* 导入进度条 */}
          {isProcessing && importProgress.total > 0 && (
            <div className='mt-3'>
              <div className='flex items-center justify-between text-white/90 text-xs mb-1'>
                <span>导入进度</span>
                <span className='font-mono font-semibold'>
                  {importProgress.current}/{importProgress.total}
                </span>
              </div>
              <div className='h-2 bg-white/20 rounded-full overflow-hidden'>
                <div
                  className='h-full bg-white/90 transition-all duration-300 ease-out'
                  style={{
                    width: `${
                      (importProgress.current / importProgress.total) * 100
                    }%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* 内容区 - 优化间距 */}
        <div className='flex-1 overflow-y-auto p-5'>
          {mode === 'import' && (
            <div className='space-y-3'>
              {/* 拖放区域 - 更紧凑 */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-all ${
                  isDragging
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'
                }`}
              >
                <div className='flex flex-col items-center space-y-3'>
                  <div
                    className={`p-3 rounded-full ${
                      isDragging
                        ? 'bg-blue-100 dark:bg-blue-900/40'
                        : 'bg-gray-100 dark:bg-gray-700'
                    }`}
                  >
                    <Upload
                      className={`w-10 h-10 ${
                        isDragging
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-gray-400 dark:text-gray-500'
                      }`}
                    />
                  </div>
                  <div>
                    <p className='text-base font-medium text-gray-700 dark:text-gray-300'>
                      {isDragging ? '松开以上传文件' : '拖放文件到这里'}
                    </p>
                    <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                      或点击下方按钮选择文件
                    </p>
                  </div>
                  <label className='cursor-pointer'>
                    <input
                      type='file'
                      // 允许更多文件类型
                      accept='.json,.csv,.txt'
                      onChange={handleFileInput}
                      className='hidden'
                      disabled={isProcessing}
                    />
                    <div
                      className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isProcessing
                          ? 'bg-gray-400 cursor-not-allowed text-white'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                    >
                      {/* 文本微调 */}
                      {isProcessing ? '处理中...' : '选择文件'}
                    </div>
                  </label>
                </div>
              </div>

              {/* 说明文档 - 更紧凑 (更新说明文本) */}
              <div className='bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3'>
                <h4 className='font-semibold text-blue-900 dark:text-blue-200 mb-1.5 text-sm'>
                  📝 导入说明
                </h4>
                <ul className='text-xs text-blue-800 dark:text-blue-300 space-y-0.5'>
                  <li>• 支持 JSON, CSV, 或纯文本(一行一个API)格式</li>
                  <li>• 重复的 key 将被跳过，不会覆盖现有配置</li>
                  <li>• 导入完成后会显示详细的导入结果</li>
                  <li>• 建议先导出备份，再进行导入操作</li>
                </ul>
              </div>
            </div>
          )}

          {/* 将原有的简单导出界面替换为功能强大的导出选项界面 */}
          {mode === 'export' && (
            <div className='space-y-6'>
              <div>
                <label className='text-sm font-medium text-gray-700 dark:text-gray-300'>导出范围</label>
                <div className='mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2'>
                  <label className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors ${exportScope === 'all' ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}>
                    <input type='radio' name='scope' value='all' checked={exportScope === 'all'} onChange={() => setExportScope('all')} className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 dark:border-gray-500" />
                    <span>全部 ({totalCount})</span>
                  </label>
                  <label className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors ${exportScope === 'selected' ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50'} ${selectedCount === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <input type='radio' name='scope' value='selected' checked={exportScope === 'selected'} onChange={() => setExportScope('selected')} disabled={selectedCount === 0} className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 dark:border-gray-500" />
                    <span>已选 ({selectedCount})</span>
                  </label>
                  <label className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors ${exportScope === 'filtered' ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}>
                    <input type='radio' name='scope' value='filtered' checked={exportScope === 'filtered'} onChange={() => setExportScope('filtered')} className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 dark:border-gray-500" />
                    <span>筛选结果 ({filteredCount})</span>
                  </label>
                </div>
              </div>
              <div>
                <label className='text-sm font-medium text-gray-700 dark:text-gray-300'>导出格式</label>
                <div className='mt-2 grid grid-cols-3 gap-2'>
                  {(['json', 'csv', 'text'] as ExportFormat[]).map((format) => (
                    <button
                      key={format}
                      onClick={() => setExportFormat(format)}
                      className={`flex items-center justify-center gap-2 py-3 rounded-lg border transition-colors ${
                        exportFormat === format
                          ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 font-semibold'
                          : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                      }`}
                    >
                      {format === 'json' && <FileJson size={16} />}
                      {format === 'csv' && <Sheet size={16} />}
                      {format === 'text' && <FileText size={16} />}
                      {format.toUpperCase()}
                    </button>
                  ))}
                </div>
                <p className='text-xs text-gray-500 dark:text-gray-400 mt-2'>
                  纯文本(TEXT)格式仅导出API地址。
                </p>
              </div>
            </div>
          )}

          {/* 结果页 */}
          {mode === 'result' && result && (
            <div className='space-y-3'>
              {/* 统计信息 - 更紧凑 */}
              <div className='grid grid-cols-3 gap-3'>
                <div className='bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 text-center'>
                  <div className='text-2xl font-bold text-green-600 dark:text-green-400'>
                    {result.success}
                  </div>
                  <div className='text-xs text-green-700 dark:text-green-300 mt-0.5'>
                    成功导入
                  </div>
                </div>
                <div className='bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 text-center'>
                  <div className='text-2xl font-bold text-yellow-600 dark:text-yellow-400'>
                    {result.skipped}
                  </div>
                  <div className='text-xs text-yellow-700 dark:text-yellow-300 mt-0.5'>
                    已跳过
                  </div>
                </div>
                <div className='bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-center'>
                  <div className='text-2xl font-bold text-red-600 dark:text-red-400'>
                    {result.failed}
                  </div>
                  <div className='text-xs text-red-700 dark:text-red-300 mt-0.5'>
                    导入失败
                  </div>
                </div>
              </div>

              {/* 详细列表 - 优化高度和间距 */}
              <div className='max-h-[350px] overflow-y-auto'>
                <div className='space-y-1.5'>
                  {result.details.map((item, index) => (
                    <div
                      key={index}
                      className={`flex items-start space-x-2.5 p-2.5 rounded-lg border ${
                        item.status === 'success'
                          ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                          : item.status === 'skipped'
                          ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                          : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                      }`}
                    >
                      {item.status === 'success' ? (
                        <CheckCircle className='w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5' />
                      ) : (
                        <AlertCircle
                          className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
                            item.status === 'skipped'
                              ? 'text-yellow-600 dark:text-yellow-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                        />
                      )}
                      <div className='flex-1 min-w-0'>
                        <div className='flex items-center space-x-1.5'>
                          <span className='text-sm font-medium text-gray-900 dark:text-gray-100 truncate'>
                            {item.name}
                          </span>
                          <span className='text-[10px] text-gray-500 dark:text-gray-400 font-mono'>
                            ({item.key})
                          </span>
                        </div>
                        {item.reason && (
                          <p className='text-xs text-gray-600 dark:text-gray-400 mt-0.5'>
                            {item.reason}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 底部按钮 - 更紧凑*/}
        <div className='flex-shrink-0 px-5 py-3 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end space-x-2.5'>
          {/* onClick事件现在会传递用户选择的格式和范围 */}
          {mode === 'export' && onExport && (
            <button
              onClick={() => onExport(exportFormat, exportScope)}
              className='px-4 py-2 text-sm bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all shadow-md hover:shadow-lg font-medium'
            >
              确认导出
            </button>
          )}
          <button
            onClick={onClose}
            disabled={isProcessing}
            className={`px-4 py-2 text-sm rounded-lg transition-colors font-medium ${
              isProcessing
                ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
            }`}
          >
            {mode === 'result' ? '完成' : '取消'}
          </button>
        </div>
      </div>
    </div>
  );

  // createPortal
  if (typeof window === 'undefined') return null;
  return createPortal(modalContent, document.body);
}
