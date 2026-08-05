import {
  ArrowDownUp,
  Download,
  Info,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { InteractivePressable } from './InteractivePressable';
import { theme } from './theme';

export type WorkspaceOption<Value extends string> = {
  readonly label: string;
  readonly value: Value;
};

type WorkspaceSurfaceProps = {
  readonly children: ReactNode;
  readonly description?: string;
  readonly eyebrow?: string;
  readonly title: string;
};

export function WorkspaceSurface({
  children,
  description,
  eyebrow,
  title,
}: WorkspaceSurfaceProps) {
  return (
    <View style={styles.surface}>
      <View style={styles.surfaceHeading}>
        {eyebrow === undefined ? null : (
          <Text style={styles.eyebrow}>{eyebrow}</Text>
        )}
        <Text style={styles.title}>{title}</Text>
        {description === undefined ? null : (
          <Text style={styles.description}>{description}</Text>
        )}
      </View>
      {children}
    </View>
  );
}

export type InsightStripItem = {
  readonly label: string;
  readonly value: string;
};

export function InsightStrip({ items }: { readonly items: readonly InsightStripItem[] }) {
  return (
    <View style={styles.insightStrip}>
      {items.map((item, index) => (
        <View
          key={item.label}
          style={[styles.insightItem, index > 0 && styles.insightItemSeparated]}
        >
          <Text style={styles.insightValue}>{item.value}</Text>
          <Text style={styles.insightLabel}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

export function WorkspaceStatusTag({
  label,
  tone = 'muted',
}: {
  readonly label: string;
  readonly tone?: 'muted' | 'primary' | 'secondary';
}) {
  return (
    <View
      style={[
        styles.statusTag,
        tone === 'primary' && styles.statusTagPrimary,
        tone === 'secondary' && styles.statusTagSecondary,
      ]}
    >
      <View
        style={[
          styles.statusDot,
          tone === 'primary' && styles.statusDotPrimary,
          tone === 'secondary' && styles.statusDotSecondary,
        ]}
      />
      <Text
        style={[
          styles.statusLabel,
          tone === 'primary' && styles.statusLabelPrimary,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export function WorkspaceBoundaryNotice({
  children,
  label,
}: {
  readonly children: ReactNode;
  readonly label: string;
}) {
  return (
    <View style={styles.boundaryNotice}>
      <ShieldCheck color={theme.color.brand.primary} size={19} />
      <View style={styles.boundaryCopy}>
        <Text style={styles.boundaryLabel}>{label}</Text>
        <Text style={styles.boundaryText}>{children}</Text>
      </View>
    </View>
  );
}

type WorkspaceToolbarProps<Filter extends string, Sort extends string> = {
  readonly exportDisabled?: boolean;
  readonly filter: Filter;
  readonly filterOptions: readonly WorkspaceOption<Filter>[];
  readonly onExport: () => void;
  readonly onFilterChange: (value: Filter) => void;
  readonly onQueryChange: (value: string) => void;
  readonly onSortChange: (value: Sort) => void;
  readonly query: string;
  readonly resultCount: number;
  readonly searchPlaceholder: string;
  readonly sort: Sort;
  readonly sortOptions: readonly WorkspaceOption<Sort>[];
};

export function WorkspaceToolbar<Filter extends string, Sort extends string>({
  exportDisabled = false,
  filter,
  filterOptions,
  onExport,
  onFilterChange,
  onQueryChange,
  onSortChange,
  query,
  resultCount,
  searchPlaceholder,
  sort,
  sortOptions,
}: WorkspaceToolbarProps<Filter, Sort>) {
  const nextSortIndex = (sortOptions.findIndex((option) => option.value === sort) + 1) %
    sortOptions.length;
  const nextSort = sortOptions[nextSortIndex]?.value ?? sort;
  const activeSortLabel =
    sortOptions.find((option) => option.value === sort)?.label ?? '排序';

  return (
    <View style={styles.toolbar}>
      <View style={styles.searchControl}>
        <Search color={theme.color.text.secondary} size={18} />
        <TextInput
          accessibilityLabel={searchPlaceholder}
          onChangeText={onQueryChange}
          placeholder={searchPlaceholder}
          placeholderTextColor={theme.color.text.disabled}
          style={styles.searchInput}
          value={query}
        />
      </View>
      <View style={styles.toolbarRow}>
        <View accessibilityLabel="状态筛选" style={styles.filterGroup}>
          <SlidersHorizontal color={theme.color.text.secondary} size={17} />
          {filterOptions.map((option) => {
            const isSelected = option.value === filter;
            return (
              <InteractivePressable
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                key={option.value}
                onPress={() => onFilterChange(option.value)}
                style={({ focused, hovered, pressed }) => [
                  styles.filterButton,
                  isSelected && styles.filterButtonSelected,
                  hovered && styles.hovered,
                  focused && styles.focused,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.filterLabel,
                    isSelected && styles.filterLabelSelected,
                  ]}
                >
                  {option.label}
                </Text>
              </InteractivePressable>
            );
          })}
        </View>
        <InteractivePressable
          accessibilityLabel={`当前排序：${activeSortLabel}，点击切换`}
          accessibilityRole="button"
          onPress={() => onSortChange(nextSort)}
          style={({ focused, hovered, pressed }) => [
            styles.toolbarButton,
            hovered && styles.hovered,
            focused && styles.focused,
            pressed && styles.pressed,
          ]}
        >
          <ArrowDownUp color={theme.color.text.primary} size={17} />
          <Text style={styles.toolbarButtonLabel}>{activeSortLabel}</Text>
        </InteractivePressable>
        <InteractivePressable
          accessibilityLabel={`导出当前 ${resultCount} 条真实数据为 CSV`}
          accessibilityRole="button"
          disabled={exportDisabled}
          onPress={onExport}
          style={({ focused, hovered, pressed }) => [
            styles.exportButton,
            exportDisabled && styles.disabled,
            hovered && !exportDisabled && styles.exportButtonHovered,
            focused && styles.focused,
            pressed && styles.pressed,
          ]}
        >
          <Download color={theme.color.surface.card} size={17} />
          <Text style={styles.exportButtonLabel}>导出 CSV</Text>
        </InteractivePressable>
      </View>
      <View style={styles.resultMeta}>
        <Info color={theme.color.text.secondary} size={15} />
        <Text style={styles.resultMetaText}>当前结果 {resultCount} 条</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  boundaryCopy: { flex: 1, gap: 2 },
  boundaryLabel: { color: theme.color.text.primary, fontSize: theme.text.size.xs, fontWeight: '800' },
  boundaryNotice: { alignItems: 'flex-start', backgroundColor: theme.color.surface.primaryTint, borderLeftColor: theme.color.brand.primary, borderLeftWidth: 3, flexDirection: 'row', gap: theme.space.sm, padding: theme.space.base },
  boundaryText: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, lineHeight: 18 },
  description: { color: theme.color.text.secondary, fontSize: theme.text.size.sm, lineHeight: 21, marginTop: theme.space.xs },
  disabled: { opacity: 0.45 },
  eyebrow: { color: theme.color.brand.primary, fontSize: theme.text.size.xs, fontWeight: '800', letterSpacing: 0.8, marginBottom: theme.space.xs },
  exportButton: { alignItems: 'center', backgroundColor: theme.color.brand.primary, borderRadius: theme.radius.control, flexDirection: 'row', gap: theme.space.sm, minHeight: 44, paddingHorizontal: theme.space.md },
  exportButtonHovered: { opacity: 0.88, transform: [{ translateY: -1 }] },
  exportButtonLabel: { color: theme.color.surface.card, fontSize: theme.text.size.sm, fontWeight: '700' },
  filterButton: { alignItems: 'center', borderRadius: theme.radius.pill, justifyContent: 'center', minHeight: 36, paddingHorizontal: theme.space.base },
  filterButtonSelected: { backgroundColor: theme.color.surface.primaryTint },
  filterGroup: { alignItems: 'center', borderColor: theme.color.border.default, borderRadius: theme.radius.control, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.xs, minHeight: 44, paddingHorizontal: theme.space.xs },
  filterLabel: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, fontWeight: '700' },
  filterLabelSelected: { color: theme.color.brand.primary },
  focused: { borderColor: theme.color.brand.primary, borderWidth: 1, boxShadow: '0 0 0 3px rgba(22, 119, 254, 0.18)' },
  hovered: { backgroundColor: theme.color.surface.primaryTint },
  insightItem: { flex: 1, minWidth: 110, paddingHorizontal: theme.space.md, paddingVertical: theme.space.base },
  insightItemSeparated: { borderLeftColor: theme.color.border.default, borderLeftWidth: 1 },
  insightLabel: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, marginTop: 3 },
  insightStrip: { backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: theme.radius.control, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', overflow: 'hidden' },
  insightValue: { color: theme.color.text.primary, fontSize: theme.text.size.lg, fontWeight: '800' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  resultMeta: { alignItems: 'center', flexDirection: 'row', gap: theme.space.xs },
  resultMetaText: { color: theme.color.text.secondary, fontSize: theme.text.size.xs },
  searchControl: { alignItems: 'center', backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: theme.radius.control, borderWidth: 1, flexDirection: 'row', gap: theme.space.sm, minHeight: 46, paddingHorizontal: theme.space.base },
  searchInput: { color: theme.color.text.primary, flex: 1, fontSize: theme.text.size.sm, minWidth: 180, paddingVertical: 0 },
  statusDot: { backgroundColor: theme.color.text.disabled, borderRadius: theme.radius.pill, height: 7, width: 7 },
  statusDotPrimary: { backgroundColor: theme.color.brand.primary },
  statusDotSecondary: { backgroundColor: theme.color.brand.secondary },
  statusLabel: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, fontWeight: '700' },
  statusLabelPrimary: { color: theme.color.brand.primary },
  statusTag: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: theme.color.surface.muted, borderRadius: theme.radius.pill, flexDirection: 'row', gap: theme.space.xs, minHeight: 28, paddingHorizontal: theme.space.sm },
  statusTagPrimary: { backgroundColor: theme.color.surface.primaryTint },
  statusTagSecondary: { backgroundColor: theme.color.surface.secondaryTint, borderColor: theme.color.brand.secondary, borderWidth: 1 },
  surface: { backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: theme.radius.card, borderWidth: 1, gap: theme.space.md, overflow: 'hidden', padding: theme.space.lg },
  surfaceHeading: { maxWidth: 760 },
  title: { color: theme.color.text.primary, fontSize: theme.text.size.lg, fontWeight: '800' },
  toolbar: { gap: theme.space.sm },
  toolbarButton: { alignItems: 'center', borderColor: theme.color.border.default, borderRadius: theme.radius.control, borderWidth: 1, flexDirection: 'row', gap: theme.space.sm, minHeight: 44, paddingHorizontal: theme.space.base },
  toolbarButtonLabel: { color: theme.color.text.primary, fontSize: theme.text.size.sm, fontWeight: '700' },
  toolbarRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
});
