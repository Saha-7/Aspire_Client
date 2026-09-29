// src/components/BrandFilter.jsx
import SearchableSelect from './SearchableSelect';

export default function BrandFilter({ brands, value, onChange }) {
  return (
    <SearchableSelect
      options={brands}
      value={value}
      onChange={onChange}
      allLabel="All Brands"
      searchPlaceholder="Search brand..."
    />
  );
}