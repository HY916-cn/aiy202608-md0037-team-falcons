# CODEOWNERS 参考模板

根据“当前仓库只保存 Markdown 文件”的要求，本模板暂以 `.md` 保存，不会被 GitHub 自动执行。

准备启用 GitHub Code Owners 时，将下面代码块内容复制到 `.github/CODEOWNERS`，并把三个占位账号替换为真实 GitHub 用户名。

```text
*                                        @developer-a @developer-b @reviewer-c

/apps/client/app/                        @developer-a @reviewer-c
/apps/client/src/shared/                 @developer-a @reviewer-c
/packages/ui/                            @developer-a @reviewer-c
/packages/auth/                          @developer-a @reviewer-c
/apps/client/src/features/courseware/    @developer-a @reviewer-c
/apps/client/src/features/homework/      @developer-a @reviewer-c
/apps/client/src/features/grades/        @developer-a @reviewer-c

/apps/client/src/features/student-score/ @developer-b @reviewer-c
/apps/client/src/features/class-score/   @developer-b @reviewer-c
/apps/client/src/features/bank/          @developer-b @reviewer-c
/apps/client/src/features/fines/         @developer-b @reviewer-c
/apps/client/src/features/operations/    @developer-b @reviewer-c
/apps/client/src/features/ai-center/     @developer-b @reviewer-c
/supabase/                               @developer-b @reviewer-c

/packages/domain/                        @developer-a @developer-b @reviewer-c
/packages/validation/                    @developer-a @developer-b @reviewer-c
/packages/api-client/                    @developer-a @developer-b @reviewer-c
/.github/                                @reviewer-c @developer-a
/apps/desktop/                           @reviewer-c @developer-a
/docs/                                   @developer-a @developer-b @reviewer-c
```

负责人 C 主审 A、B 的功能 PR；C 自己提交的修复或构建 PR 必须由 A 或 B 批准。

