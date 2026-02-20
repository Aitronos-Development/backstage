/*
 * Copyright 2022 The Backstage Authors
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

import { BackstageTypography, PageTheme, PageThemeSelector } from './types';
import { pageTheme as defaultPageThemes } from './pageTheme';

const DEFAULT_HTML_FONT_SIZE = 16;
const DEFAULT_FONT_FAMILY =
  '"Inter", Roboto, "Helvetica Neue", Arial, sans-serif';
const DEFAULT_PAGE_THEME = 'home';

/**
 * Default Typography settings.
 *
 * @public
 */
export const defaultTypography: BackstageTypography = {
  htmlFontSize: DEFAULT_HTML_FONT_SIZE,
  fontFamily: DEFAULT_FONT_FAMILY,
  h1: {
    fontSize: 32,
    fontWeight: 700,
    marginBottom: 8,
    letterSpacing: '-0.02em',
  },
  h2: {
    fontSize: 24,
    fontWeight: 700,
    marginBottom: 6,
    letterSpacing: '-0.015em',
  },
  h3: {
    fontSize: 20,
    fontWeight: 600,
    marginBottom: 4,
    letterSpacing: '-0.01em',
  },
  h4: {
    fontWeight: 600,
    fontSize: 18,
    marginBottom: 4,
    letterSpacing: '-0.01em',
  },
  h5: {
    fontWeight: 600,
    fontSize: 15,
    marginBottom: 2,
  },
  h6: {
    fontWeight: 600,
    fontSize: 13,
    marginBottom: 2,
  },
};

/**
 * Options for {@link createBaseThemeOptions}.
 *
 * @public
 */
export interface BaseThemeOptionsInput<PaletteOptions> {
  palette: PaletteOptions;
  defaultPageTheme?: string;
  pageTheme?: Record<string, PageTheme>;
  fontFamily?: string;
  htmlFontSize?: number;
  typography?: BackstageTypography;
}

/**
 * A helper for creating theme options.
 *
 * @public
 */
export function createBaseThemeOptions<PaletteOptions>(
  options: BaseThemeOptionsInput<PaletteOptions>,
) {
  const {
    palette,
    htmlFontSize = DEFAULT_HTML_FONT_SIZE,
    fontFamily = DEFAULT_FONT_FAMILY,
    defaultPageTheme = DEFAULT_PAGE_THEME,
    pageTheme = defaultPageThemes,
    typography,
  } = options;

  if (!pageTheme[defaultPageTheme]) {
    throw new Error(`${defaultPageTheme} is not defined in pageTheme.`);
  }

  defaultTypography.htmlFontSize = htmlFontSize;
  defaultTypography.fontFamily = fontFamily;

  return {
    palette,
    typography: typography ?? defaultTypography,
    page: pageTheme[defaultPageTheme],
    getPageTheme: ({ themeId }: PageThemeSelector) =>
      pageTheme[themeId] ?? pageTheme[defaultPageTheme],
  };
}
