# CODEOWNERS 参考模板

根据“当前仓库只保存 Markdown 文件”的要求，本模板暂以 `.md` 保存，不会被 GitHub 自动执行。

准备启用 GitHub Code Owners 时，将下面代码块内容复制到 `.github/CODEOWNERS`，并把三个占位账号替换为真实 GitHub 用户名。

```text
*                                        @cskunkuncskk @developer-b @HY916-cn

/apps/client/app/                        @cskunkuncskk @HY916-cn
/apps/client/src/shared/                 @cskunkuncskk @HY916-cn
/packages/ui/                            @cskunkuncskk @HY916-cn
/packages/auth/                          @cskunkuncskk @HY916-cn
/apps/client/src/features/courseware/    @cskunkuncskk @HY916-cn
/apps/client/src/features/homework/      @cskunkuncskk @HY916-cn
/apps/client/src/features/grades/        @cskunkuncskk @HY916-cn

/apps/client/src/features/student-score/ @developer-b @HY916-cn
/apps/client/src/features/class-score/   @developer-b @HY916-cn
/apps/client/src/features/bank/          @developer-b @HY916-cn
/apps/client/src/features/fines/         @developer-b @HY916-cn
/apps/client/src/features/operations/    @developer-b @HY916-cn
/apps/client/src/features/ai-center/     @developer-b @HY916-cn
/supabase/                               @developer-b @HY916-cn

/packages/domain/                        @cskunkuncskk @developer-b @HY916-cn
/packages/validation/                    @cskunkuncskk @developer-b @HY916-cn
/packages/api-client/                    @cskunkuncskk @developer-b @HY916-cn
/.github/                                @HY916-cn @cskunkuncskk
/apps/desktop/                           @HY916-cn @cskunkuncskk
/docs/                                   @cskunkuncskk @developer-b @HY916-cn
```

负责人 C 主审 A、B 的功能 PR；C 自己提交的修复或构建 PR 必须由 A 或 B 批准。
