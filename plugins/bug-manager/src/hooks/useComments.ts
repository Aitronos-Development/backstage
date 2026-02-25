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

import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { Comment } from '../api/types';
import { bugManagerApiRef } from '../api/BugManagerApi';

export function useComments(bugId: string | null) {
  const api = useApi(bugManagerApiRef);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!bugId) {
      setComments([]);
      return;
    }
    setLoading(true);
    api
      .getComments(bugId)
      .then(setComments)
      .finally(() => setLoading(false));
  }, [bugId, api]);

  const addComment = useCallback(
    async (content: string, parentCommentId?: string) => {
      if (!bugId) return;
      const comment = await api.addComment(bugId, content, parentCommentId);
      setComments(prev => [...prev, comment]);
    },
    [bugId, api],
  );

  const updateComment = useCallback(
    async (commentId: string, content: string) => {
      if (!bugId) return;
      const updated = await api.updateComment(bugId, commentId, content);
      setComments(prev => prev.map(c => (c.id === commentId ? updated : c)));
    },
    [bugId, api],
  );

  const deleteComment = useCallback(
    async (commentId: string) => {
      if (!bugId) return;
      await api.deleteComment(bugId, commentId);
      setComments(prev =>
        prev
          .filter(c => c.id !== commentId)
          .map(c =>
            c.parentCommentId === commentId ? { ...c, parentCommentId: undefined } : c,
          ),
      );
    },
    [bugId, api],
  );

  return { comments, addComment, updateComment, deleteComment, loading };
}
