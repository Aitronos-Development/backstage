/*
 * Copyright 2020 The Backstage Authors
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

/**
 * Built-in Backstage color palettes.
 *
 * @public
 */
export const palettes = {
  light: {
    type: 'light' as const,
    mode: 'light' as const,
    background: {
      default: '#F8F7FC',
      paper: '#FFFFFF',
    },
    status: {
      ok: '#10B981',
      warning: '#F59E0B',
      error: '#EF4444',
      running: '#7C3AED',
      pending: '#F59E0B',
      aborted: '#9CA3AF',
    },
    bursts: {
      fontColor: '#FEFEFE',
      slackChannelText: '#ddd',
      backgroundColor: {
        default: '#5B21B6',
      },
      gradient: {
        linear: 'linear-gradient(-137deg, #7C3AED 0%, #4F46E5 100%)',
      },
    },
    primary: {
      main: '#7C3AED',
      light: '#A78BFA',
      dark: '#5B21B6',
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#6B7280',
    },
    banner: {
      info: '#7C3AED',
      error: '#EF4444',
      text: '#FFFFFF',
      link: '#1E1B4B',
      closeButtonColor: '#FFFFFF',
      warning: '#F59E0B',
    },
    border: '#E9E5F5',
    textContrast: '#1E1B4B',
    textVerySubtle: '#DDD6FE',
    textSubtle: '#6B7280',
    highlight: '#F5F3FF',
    errorBackground: '#FEF2F2',
    warningBackground: '#FFFBEB',
    infoBackground: '#F5F3FF',
    errorText: '#991B1B',
    infoText: '#3730A3',
    warningText: '#92400E',
    linkHover: '#6D28D9',
    link: '#7C3AED',
    gold: '#F59E0B',
    navigation: {
      background: '#1E1B4B',
      indicator: '#A78BFA',
      color: '#C4C0E0',
      selectedColor: '#FFFFFF',
      navItem: {
        hoverBackground: 'rgba(255, 255, 255, 0.06)',
      },
      submenu: {
        background: '#252264',
      },
    },
    pinSidebarButton: {
      icon: '#1E1B4B',
      background: '#DDD6FE',
    },
    tabbar: {
      indicator: '#7C3AED',
    },
  },
  dark: {
    type: 'dark' as const,
    mode: 'dark' as const,
    background: {
      default: '#111019',
      paper: '#1A1825',
    },
    status: {
      ok: '#4ADE80',
      warning: '#FBBF24',
      error: '#FB7185',
      running: '#A78BFA',
      pending: '#FBBF24',
      aborted: '#71717A',
    },
    bursts: {
      fontColor: '#FEFEFE',
      slackChannelText: '#ddd',
      backgroundColor: {
        default: '#A78BFA',
      },
      gradient: {
        linear: 'linear-gradient(-137deg, #A78BFA 0%, #818CF8 100%)',
      },
    },
    primary: {
      main: '#A78BFA',
      dark: '#7C3AED',
      light: '#C4B5FD',
      contrastText: '#111019',
    },
    secondary: {
      main: '#94A3B8',
    },
    banner: {
      info: '#A78BFA',
      error: '#FB7185',
      text: '#111019',
      link: '#C4B5FD',
      closeButtonColor: '#111019',
      warning: '#FBBF24',
    },
    border: '#2A283E',
    textContrast: '#F4F4F5',
    textVerySubtle: '#2A283E',
    textSubtle: '#A1A1AA',
    highlight: '#1E1B30',
    errorBackground: '#3B1219',
    warningBackground: '#3B2008',
    infoBackground: '#1E1B30',
    errorText: '#FCA5A5',
    infoText: '#C4B5FD',
    warningText: '#FCD34D',
    linkHover: '#C4B5FD',
    link: '#A78BFA',
    gold: '#FBBF24',
    navigation: {
      background: '#0E0D16',
      indicator: '#A78BFA',
      color: '#9B98B0',
      selectedColor: '#F4F4F5',
      navItem: {
        hoverBackground: 'rgba(255, 255, 255, 0.05)',
      },
      submenu: {
        background: '#161422',
      },
    },
    pinSidebarButton: {
      icon: '#A1A1AA',
      background: '#2A283E',
    },
    tabbar: {
      indicator: '#A78BFA',
    },
  },
};
