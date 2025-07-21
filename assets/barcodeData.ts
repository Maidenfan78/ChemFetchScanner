export type ProductInfo = {
  name: string;
  manufacturer: string;
  size: string;
  sdsUrl: string;
};

export const barcodeData: Record<string, ProductInfo> = {
  '93549004': {
    name: 'Sample Chemical',
    manufacturer: 'Chem Co',
    size: '500ml',
    sdsUrl: 'https://example.com/sds.pdf',
  },
};
