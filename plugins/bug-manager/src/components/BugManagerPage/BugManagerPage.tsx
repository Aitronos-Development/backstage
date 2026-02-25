/*
 * Copyright 2026 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Content, Header, Page, ResponseErrorPanel } from '@backstage/core-components';
import BugReportIcon from '@material-ui/icons/BugReport';
import { BugManagerProvider } from '../../context/BugManagerProvider';
import { useBugManagerContext } from '../../context/useBugManagerContext';
import { Toolbar } from './Toolbar';
import { ListView } from '../ListView/ListView';
import { BoardView } from '../BoardView/BoardView';
import { BugDetailModal } from '../BugDetailModal/BugDetailModal';
import { AssigneeBar } from '../AssigneeBar/AssigneeBar';

const BugManagerContent = () => {
  const {
    bugs,
    activeView,
    loading,
    error,
    selectedBugId,
    includeClosed,
    assignees,
    selectedAssigneeIds,
    toggleAssignee,
    clearAssigneeFilter,
  } = useBugManagerContext();

  let subtitle = `${bugs.length} active bugs`;
  if (loading) {
    subtitle = 'Loading...';
  } else if (includeClosed) {
    subtitle = `${bugs.length} bugs (including closed)`;
  }

  return (
    <Page themeId="tool">
      <Header
        title="Bug Manager"
        subtitle={subtitle}
      >
        <BugReportIcon />
      </Header>
      <Content>
        {error ? (
          <ResponseErrorPanel error={new Error(error)} />
        ) : (
          <>
            <Toolbar />
            <AssigneeBar
              assignees={assignees}
              selectedIds={selectedAssigneeIds}
              onToggle={toggleAssignee}
              onClear={clearAssigneeFilter}
            />
            {activeView === 'list' && <ListView />}
            {activeView === 'board' && <BoardView />}
          </>
        )}
      </Content>
      {selectedBugId && <BugDetailModal />}
    </Page>
  );
};

export const BugManagerPage = () => (
  <BugManagerProvider>
    <BugManagerContent />
  </BugManagerProvider>
);
