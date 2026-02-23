/*
 * Copyright 2021 The Backstage Authors
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
import {
  alertApiRef,
  identityApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import { appLanguageApiRef } from '@backstage/core-plugin-api/alpha';
import Tooltip from '@material-ui/core/Tooltip';
import Typography from '@material-ui/core/Typography';
import { useEffect, useMemo, useState } from 'react';
import useAsync from 'react-use/esm/useAsync';
import useObservable from 'react-use/esm/useObservable';
import { getTimeBasedGreeting } from './timeUtil';
import { Variant } from '@material-ui/core/styles/createTypography';

/** Map a BCP-47 language code (e.g. "en") to the English display name used in locale files */
function languageCodeToName(code: string): string | undefined {
  try {
    const names = new Intl.DisplayNames(['en'], { type: 'language' });
    return names.of(code);
  } catch {
    return undefined;
  }
}

/** @public */
export type WelcomeTitleLanguageProps = {
  language?: string[];
  variant?: Variant | 'inherit';
};

export const WelcomeTitle = ({
  language,
  variant = 'inherit',
}: WelcomeTitleLanguageProps) => {
  const identityApi = useApi(identityApiRef);
  const alertApi = useApi(alertApiRef);

  const languageApi = useApi(appLanguageApiRef);
  const [languageObservable] = useState(() => languageApi.language$());
  const { language: appLanguageCode } = useObservable(
    languageObservable,
    languageApi.getLanguage(),
  );
  const appLanguageName = useMemo(
    () => languageCodeToName(appLanguageCode),
    [appLanguageCode],
  );

  const greeting = useMemo(
    () =>
      getTimeBasedGreeting(
        language ?? (appLanguageName ? [appLanguageName] : undefined),
      ),
    [language, appLanguageName],
  );

  const { value: profile, error } = useAsync(() =>
    identityApi.getProfileInfo(),
  );

  useEffect(() => {
    if (error) {
      alertApi.post({
        message: `Failed to load user identity: ${error}`,
        severity: 'error',
      });
    }
  }, [error, alertApi]);

  return (
    <Tooltip title={greeting.language}>
      <Typography component="span" variant={variant}>{`${greeting.greeting}${
        profile?.displayName ? `, ${profile?.displayName}` : ''
      }!`}</Typography>
    </Tooltip>
  );
};
