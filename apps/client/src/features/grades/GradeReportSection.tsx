import type { AuthRoleScope, RoleCode } from '@dolphincloud/auth';
import { Text } from 'react-native';

import { FamilyGradeReportList } from './FamilyGradeReportList';
import { TeacherGradeReportWorkspace } from './TeacherGradeReportWorkspace';

export function GradeReportSection({
  role,
  roleScope,
}: {
  readonly role: RoleCode;
  readonly roleScope: AuthRoleScope;
}) {
  if (role === 'teacher') {
    return (
      <TeacherGradeReportWorkspace
        key={roleScope.assignmentId}
        roleScope={roleScope}
      />
    );
  }
  if (role === 'family') {
    return (
      <FamilyGradeReportList
        key={roleScope.assignmentId}
        roleScope={roleScope}
      />
    );
  }
  return <Text>当前角色不能读取个人成绩单。</Text>;
}
