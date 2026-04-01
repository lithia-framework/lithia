import type { BaseLayoutProps } from "@/layouts/shared";

export const baseOptions: BaseLayoutProps = {
  themeSwitch: {
    enabled: true,
  },
  i18n: false,
};

export const homeOptions: BaseLayoutProps = {
  ...baseOptions,
  links: [
    {
      type: "main",
      text: "Docs",
      url: "/docs/latest",
    },
  ]
};