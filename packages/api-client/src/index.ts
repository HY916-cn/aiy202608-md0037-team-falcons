export type ApiSuccess<TData> = {
  data: TData;
  request_id: string;
  operation_id?: string;
};

export type ApiFailure = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  request_id: string;
};

export type ApiResponse<TData> = ApiSuccess<TData> | ApiFailure;

export * from './apiError';
export * from './assignmentService';
export * from './coursewareService';
export * from './gradeService';
export * from './gradeReportImport';
export * from './gradeReportSheetService';
export * from './governanceService';
export * from './mockGovernanceService';
export * from './mockGradeReportSheetService';
export * from './supabaseTeachingDemoAdapter';
export * from './supabaseAiExperienceAdapter';
