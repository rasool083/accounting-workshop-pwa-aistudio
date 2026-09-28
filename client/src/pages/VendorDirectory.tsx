import { useMemo, useRef, useState } from "react";
import { BarChart3, Building2, ClipboardList, Download, Pencil, Plus, Search, Trash2, TrendingDown, TrendingUp, Upload, X } from "lucide-react";
import { formatMoney, formatNumber, parseLocalizedNumber, todayJalali } from "@/lib/accounting";
import {
  createVendor,
  createVendorQuote,
  exportVendorDirectory,
  getMaterialStats,
  importVendorDirectory,
  loadVendorDirectory,
  materialNames,
  quoteUnitKey,
  saveVendorDirectory,
  type Vendor,
  type VendorDirectoryState,
  type VendorKind,
  type VendorQuote,
  type QuoteStatus,
} from "@/lib/vendorDirectory";

const vendorKinds: VendorKind[] = ["تولیدکننده", "واردکننده", "بازرگانی", "نماینده", "سایر"];
const quoteStatuses: QuoteStatus[] = ["معتبر", "بررسی نشده", "منقضی"];
const blankVendor = { name: "", kind: "بازرگانی" as VendorKind, contactName: "", phone: "", email: "", location: "", website: "", suppliedMaterials: "", notes: "", active: true };
const blankQuote = { vendorId: "", materialName: "", quoteDate: todayJalali(), price: "", currency: "تومان", unit: "کیلوگرم", packageDescription: "", minimumOrder: "", leadTimeDays: "", validUntil: "", status: "بررسی نشده" as QuoteStatus, source: "تماس تلفنی", notes: "" };

type Props = { onNotice?: (message: string) => void };

export default function VendorDirectory({ onNotice }: Props) {
  const [directory, setDirectory] = useState<VendorDirectoryState>(() => loadVendorDirectory());
  const [query, setQuery] = useState("");
  const [materialFilter, setMaterialFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("همه");
  const [selectedMaterial, setSelectedMaterial] = useState("");
  const [vendorForm, setVendorForm] = useState(blankVendor);
  const [quoteForm, setQuoteForm] = useState(blankQuote);
  const [editingVendorId, setEditingVendorId] = useState<string | null>(null);
  const [showVendorForm, setShowVendorForm] = useState(false);
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [expandedVendorId, setExpandedVendorId] = useState<string | null>(null);
  const backupInput = useRef<HTMLInputElement>(null);

  const materials = useMemo(() => materialNames(directory), [directory]);
  const filteredVendors = useMemo(() => directory.vendors.filter(vendor => {
    const haystack = [vendor.name, vendor.contactName, vendor.phone, vendor.location, ...vendor.suppliedMaterials].join(" ").toLocaleLowerCase("fa");
    return (!query || haystack.includes(query.toLocaleLowerCase("fa"))) &&
      (!materialFilter || vendor.suppliedMaterials.includes(materialFilter)) &&
      (kindFilter === "همه" || vendor.kind === kindFilter);
  }), [directory, query, materialFilter, kindFilter]);
  const stats = useMemo(() => getMaterialStats(directory, selectedMaterial || undefined), [directory, selectedMaterial]);
  const selectedQuotes = useMemo(() => directory.quotes
    .filter(quote => !selectedMaterial || quote.materialName === selectedMaterial)
    .filter(quote => !query || quote.materialName.includes(query) || directory.vendors.find(vendor => vendor.id === quote.vendorId)?.name.includes(query))
    .sort((a, b) => b.quoteDate.localeCompare(a.quoteDate)), [directory, selectedMaterial, query]);

  function persist(next: VendorDirectoryState, message: string) {
    setDirectory(saveVendorDirectory(next));
    onNotice?.(message);
  }

  function downloadBackup() {
    const blob = new Blob([exportVendorDirectory(directory)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `supplier-directory-${todayJalali().replace(/\//g, "-")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    onNotice?.("پشتیبان مستقل دفتر تأمین‌کنندگان دانلود شد");
  }

  async function handleBackupImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const imported = importVendorDirectory(await file.text());
      if (!window.confirm(`جایگزینی اطلاعات فعلی با ${imported.vendors.length} تأمین‌کننده و ${imported.quotes.length} استعلام انجام شود؟`)) return;
      persist(imported, "دفتر تأمین‌کنندگان بازیابی شد");
    } catch (error) {
      onNotice?.(error instanceof Error ? error.message : "بازیابی فایل ناموفق بود");
    }
  }

  function submitVendor(event: React.FormEvent) {
    event.preventDefault();
    if (!vendorForm.name.trim()) return;
    const normalized = { ...vendorForm, name: vendorForm.name.trim(), suppliedMaterials: vendorForm.suppliedMaterials.split(/[،,\n]/).map(item => item.trim()).filter(Boolean) };
    if (editingVendorId) {
      persist({ ...directory, vendors: directory.vendors.map(vendor => vendor.id === editingVendorId ? { ...vendor, ...normalized, updatedAt: new Date().toISOString() } : vendor) }, "اطلاعات تأمین‌کننده ویرایش شد");
    } else {
      persist({ ...directory, vendors: [createVendor(normalized), ...directory.vendors] }, "تأمین‌کننده به دفتر اضافه شد");
    }
    setVendorForm(blankVendor); setEditingVendorId(null); setShowVendorForm(false);
  }

  function editVendor(vendor: Vendor) {
    setEditingVendorId(vendor.id);
    setVendorForm({ ...vendor, suppliedMaterials: vendor.suppliedMaterials.join("، ") });
    setShowVendorForm(true);
  }

  function removeVendor(vendor: Vendor) {
    if (!window.confirm(`تأمین‌کننده «${vendor.name}» حذف شود؟ سابقهٔ استعلام‌ها نیز حذف می‌شود.`)) return;
    persist({ vendors: directory.vendors.filter(item => item.id !== vendor.id), quotes: directory.quotes.filter(quote => quote.vendorId !== vendor.id), version: 1 }, "تأمین‌کننده و استعلام‌های آن حذف شد");
  }

  function submitQuote(event: React.FormEvent) {
    event.preventDefault();
    const price = parseLocalizedNumber(quoteForm.price);
    if (!quoteForm.vendorId || !quoteForm.materialName.trim() || !Number.isFinite(price) || price < 0) return;
    persist({ ...directory, quotes: [createVendorQuote({ ...quoteForm, materialName: quoteForm.materialName.trim(), price, leadTimeDays: quoteForm.leadTimeDays ? parseLocalizedNumber(quoteForm.leadTimeDays) : undefined }), ...directory.quotes] }, "استعلام قیمت ثبت شد");
    setQuoteForm({ ...blankQuote, vendorId: quoteForm.vendorId, materialName: quoteForm.materialName });
    setShowQuoteForm(false);
  }

  function removeQuote(quote: VendorQuote) {
    if (!window.confirm("این سابقهٔ استعلام حذف شود؟")) return;
    persist({ ...directory, quotes: directory.quotes.filter(item => item.id !== quote.id) }, "سابقهٔ استعلام حذف شد");
  }

  return <div className="page-stack page-enter vendor-directory-page">
    <div className="page-intro">
      <div><span className="section-kicker">منابع خرید · مستقل از حسابداری</span><h1>دفتر تأمین‌کنندگان و استعلام‌ها</h1><p>تأمین‌کننده را حتی بدون خرید ثبت کنید؛ سابقهٔ قیمت، واحد، شرایط و زمان تحویل برای مقایسه و تصمیم‌گیری نگهداری می‌شود.</p></div>
      <div className="page-intro-actions"><button className="button button-primary" onClick={() => { setEditingVendorId(null); setVendorForm(blankVendor); setShowVendorForm(true); }}><Plus size={16} /> تأمین‌کننده جدید</button><button className="button button-ghost" onClick={() => setShowQuoteForm(true)}><ClipboardList size={16} /> ثبت استعلام قیمت</button><button className="button button-ghost" onClick={downloadBackup}><Download size={15} /> پشتیبان مستقل</button><button className="button button-ghost" onClick={() => backupInput.current?.click()}><Upload size={15} /> بازیابی</button></div>
      <input ref={backupInput} type="file" accept="application/json,.json" hidden onChange={handleBackupImport} />
    </div>

    <div className="vendor-metrics">
      <div className="metric-card"><span className="metric-icon"><Building2 size={19} /></span><small>تأمین‌کنندگان فعال</small><strong>{formatNumber(directory.vendors.filter(vendor => vendor.active).length)}</strong><span>از {formatNumber(directory.vendors.length)} ثبت‌شده</span></div>
      <div className="metric-card"><span className="metric-icon"><ClipboardList size={19} /></span><small>سابقهٔ استعلام</small><strong>{formatNumber(directory.quotes.length)}</strong><span>{formatNumber(materials.length)} مادهٔ اولیه</span></div>
      <div className="metric-card"><span className="metric-icon"><BarChart3 size={19} /></span><small>مادهٔ انتخاب‌شده</small><strong>{selectedMaterial || "همه"}</strong><span>برای مقایسهٔ قیمت</span></div>
      <div className="metric-card"><span className="metric-icon"><TrendingDown size={19} /></span><small>کمترین قیمت جاری</small><strong>{stats[0]?.lowestPrice != null ? formatMoney(stats[0].lowestPrice, stats[0] ? directory.quotes.find(q => q.materialName === stats[0].materialName)?.currency || "تومان" : "تومان") : "—"}</strong><span>{stats[0]?.materialName || "ابتدا ماده را انتخاب کنید"}</span></div>
    </div>

    <div className="vendor-toolbar panel">
      <label className="search-box"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="جست‌وجوی نام، ماده، تماس یا شهر..." /></label>
      <select value={materialFilter} onChange={event => setMaterialFilter(event.target.value)}><option value="">همهٔ مواد اولیه</option>{materials.map(material => <option key={material}>{material}</option>)}</select>
      <select value={kindFilter} onChange={event => setKindFilter(event.target.value)}><option>همه</option>{vendorKinds.map(kind => <option key={kind}>{kind}</option>)}</select>
      <span className="soft-tag">{formatNumber(filteredVendors.length)} تأمین‌کننده</span>
    </div>

    <div className="vendor-layout">
      <section className="panel table-panel"><div className="panel-heading"><div><span className="section-kicker">Vendor List</span><h3>فهرست تأمین‌کنندگان</h3></div><span className="soft-tag">بدون ایجاد سند خرید</span></div>
        <div className="table-wrap"><table><thead><tr><th>تأمین‌کننده</th><th>نوع فعالیت</th><th>مواد قابل تأمین</th><th>تماس</th><th>استعلام</th><th></th></tr></thead><tbody>
          {filteredVendors.map(vendor => <tr key={vendor.id} className={expandedVendorId === vendor.id ? "is-selected" : ""}>
            <td><button className="vendor-name-button" onClick={() => setExpandedVendorId(expandedVendorId === vendor.id ? null : vendor.id)}><strong>{vendor.name}</strong><small>{vendor.location || "مکان ثبت نشده"}</small></button></td><td><span className="soft-tag">{vendor.kind}</span></td><td><div className="tag-list">{vendor.suppliedMaterials.slice(0, 3).map(material => <button key={material} onClick={() => setSelectedMaterial(material)}>{material}</button>)}{vendor.suppliedMaterials.length > 3 && <span>+{vendor.suppliedMaterials.length - 3}</span>}</div></td><td><small>{vendor.contactName || "—"}</small><br /><small dir="ltr">{vendor.phone || vendor.email || "—"}</small></td><td><strong>{formatNumber(directory.quotes.filter(quote => quote.vendorId === vendor.id).length)}</strong></td><td><div className="row-actions"><button className="icon-button" title="ویرایش" onClick={() => editVendor(vendor)}><Pencil size={15} /></button><button className="icon-button danger" title="حذف" onClick={() => removeVendor(vendor)}><Trash2 size={15} /></button></div></td>
          </tr>)}
          {!filteredVendors.length && <tr><td colSpan={6}><div className="empty-state"><strong>تأمین‌کننده‌ای پیدا نشد</strong><p>فیلترها را تغییر دهید یا اولین تأمین‌کننده را ثبت کنید.</p></div></td></tr>}
        </tbody></table></div>
        {expandedVendorId && (() => { const vendor = directory.vendors.find(item => item.id === expandedVendorId); if (!vendor) return null; return <div className="vendor-detail"><div><strong>{vendor.name}</strong><p>{vendor.notes || "یادداشتی ثبت نشده است."}</p></div><div><small>وب‌سایت: {vendor.website || "—"}</small><small>ایمیل: {vendor.email || "—"}</small></div></div>; })()}
      </section>

      <section className="panel table-panel"><div className="panel-heading"><div><span className="section-kicker">Price Intelligence</span><h3>مقایسه و تحلیل قیمت</h3></div><select value={selectedMaterial} onChange={event => setSelectedMaterial(event.target.value)}><option value="">همهٔ مواد</option>{materials.map(material => <option key={material}>{material}</option>)}</select></div>
        <div className="material-stat-list">{stats.slice(0, selectedMaterial ? 1 : 6).map(stat => <button className="material-stat-row" key={stat.materialName} onClick={() => setSelectedMaterial(stat.materialName)}><span><strong>{stat.materialName}</strong><small>{formatNumber(stat.vendorCount)} تأمین‌کننده · {formatNumber(stat.quoteCount)} استعلام · {formatNumber(stat.comparableQuoteCount)} هم‌واحد</small></span><span><b>{stat.lowestPrice != null ? formatMoney(stat.lowestPrice, stat.comparisonCurrency || "تومان") : "—"}</b><small>کمترین قیمت هم‌واحد · {stat.comparisonUnit || "—"}</small></span><span className={stat.changePercent != null && stat.changePercent > 0 ? "amount-negative" : "amount-positive"}>{stat.changePercent != null ? <>{stat.changePercent > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}{formatNumber(Number(Math.abs(stat.changePercent).toFixed(1)))}٪</> : "—"}</span></button>)}{!stats.length && <p className="muted-cell">برای تحلیل، حداقل یک استعلام قیمت ثبت کنید.</p>}</div>
      </section>
    </div>

    <section className="panel table-panel"><div className="panel-heading"><div><span className="section-kicker">Quotation History</span><h3>{selectedMaterial ? `سابقهٔ استعلام «${selectedMaterial}»` : "آخرین استعلام‌های قیمت"}</h3></div><span className="soft-tag">مقایسه بر اساس واحد و تاریخ</span></div><div className="table-wrap"><table><thead><tr><th>ماده</th><th>تأمین‌کننده</th><th>تاریخ</th><th>قیمت اعلامی</th><th>شرایط</th><th>اعتبار</th><th></th></tr></thead><tbody>{selectedQuotes.slice(0, 30).map(quote => <tr key={quote.id}><td><strong>{quote.materialName}</strong><small>{quote.packageDescription || "واحد پایه"}</small></td><td>{directory.vendors.find(vendor => vendor.id === quote.vendorId)?.name || "تأمین‌کننده حذف‌شده"}</td><td>{quote.quoteDate}</td><td className="amount-cell"><strong>{formatMoney(quote.price, quote.currency)}</strong><small>{quoteUnitKey(quote)}</small></td><td><small>حداقل: {quote.minimumOrder || "—"}</small><br /><small>تحویل: {quote.leadTimeDays ? `${formatNumber(quote.leadTimeDays)} روز` : "—"}</small></td><td><span className={quote.status === "معتبر" ? "status-success" : quote.status === "منقضی" ? "status-danger" : "status-warning"}>{quote.status}</span></td><td><button className="icon-button danger" onClick={() => removeQuote(quote)}><Trash2 size={15} /></button></td></tr>)}{!selectedQuotes.length && <tr><td colSpan={7}><p className="muted-cell">هنوز استعلامی ثبت نشده است.</p></td></tr>}</tbody></table></div></section>

    {showVendorForm && <div className="vendor-modal-backdrop"><form className="panel vendor-modal" onSubmit={submitVendor}><div className="panel-heading"><div><span className="section-kicker">Supplier Directory</span><h3>{editingVendorId ? "ویرایش تأمین‌کننده" : "تأمین‌کننده جدید"}</h3></div><button type="button" className="icon-button" onClick={() => setShowVendorForm(false)}><X size={17} /></button></div><div className="form-grid"><label>نام تأمین‌کننده<input required value={vendorForm.name} onChange={event => setVendorForm({ ...vendorForm, name: event.target.value })} /></label><label>نوع فعالیت<select value={vendorForm.kind} onChange={event => setVendorForm({ ...vendorForm, kind: event.target.value as VendorKind })}>{vendorKinds.map(kind => <option key={kind}>{kind}</option>)}</select></label><label>نام تماس<input value={vendorForm.contactName} onChange={event => setVendorForm({ ...vendorForm, contactName: event.target.value })} /></label><label>تلفن<input dir="ltr" value={vendorForm.phone} onChange={event => setVendorForm({ ...vendorForm, phone: event.target.value })} /></label><label>ایمیل<input dir="ltr" value={vendorForm.email} onChange={event => setVendorForm({ ...vendorForm, email: event.target.value })} /></label><label>شهر/مکان<input value={vendorForm.location} onChange={event => setVendorForm({ ...vendorForm, location: event.target.value })} /></label><label className="full-field">مواد اولیه قابل تأمین<small>با ویرگول جدا کنید</small><input value={vendorForm.suppliedMaterials} onChange={event => setVendorForm({ ...vendorForm, suppliedMaterials: event.target.value })} /></label><label className="full-field">یادداشت<textarea value={vendorForm.notes} onChange={event => setVendorForm({ ...vendorForm, notes: event.target.value })} /></label></div><div className="form-actions"><button type="button" className="button button-ghost" onClick={() => setShowVendorForm(false)}>انصراف</button><button className="button button-primary"><Plus size={15} /> ذخیره</button></div></form></div>}
    {showQuoteForm && <div className="vendor-modal-backdrop"><form className="panel vendor-modal" onSubmit={submitQuote}><div className="panel-heading"><div><span className="section-kicker">Quotation History</span><h3>ثبت استعلام قیمت</h3></div><button type="button" className="icon-button" onClick={() => setShowQuoteForm(false)}><X size={17} /></button></div><div className="form-grid"><label>تأمین‌کننده<select required value={quoteForm.vendorId} onChange={event => setQuoteForm({ ...quoteForm, vendorId: event.target.value })}><option value="">انتخاب کنید</option>{directory.vendors.map(vendor => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select></label><label>ماده اولیه<input required list="vendor-materials" value={quoteForm.materialName} onChange={event => setQuoteForm({ ...quoteForm, materialName: event.target.value })} /><datalist id="vendor-materials">{materials.map(material => <option key={material} value={material} />)}</datalist></label><label>تاریخ استعلام<input placeholder="1405/07/01" value={quoteForm.quoteDate} onChange={event => setQuoteForm({ ...quoteForm, quoteDate: event.target.value })} /></label><label>قیمت اعلامی<input required inputMode="decimal" value={quoteForm.price} onChange={event => setQuoteForm({ ...quoteForm, price: event.target.value })} /></label><label>واحد قیمت<input value={quoteForm.unit} onChange={event => setQuoteForm({ ...quoteForm, unit: event.target.value })} /></label><label>واحد پول<input value={quoteForm.currency} onChange={event => setQuoteForm({ ...quoteForm, currency: event.target.value })} /></label><label>حداقل سفارش<input value={quoteForm.minimumOrder} onChange={event => setQuoteForm({ ...quoteForm, minimumOrder: event.target.value })} /></label><label>زمان تحویل (روز)<input inputMode="numeric" value={quoteForm.leadTimeDays} onChange={event => setQuoteForm({ ...quoteForm, leadTimeDays: event.target.value })} /></label><label>اعتبار تا<input value={quoteForm.validUntil} onChange={event => setQuoteForm({ ...quoteForm, validUntil: event.target.value })} /></label><label>وضعیت<select value={quoteForm.status} onChange={event => setQuoteForm({ ...quoteForm, status: event.target.value as QuoteStatus })}>{quoteStatuses.map(status => <option key={status}>{status}</option>)}</select></label><label>منبع استعلام<input value={quoteForm.source} onChange={event => setQuoteForm({ ...quoteForm, source: event.target.value })} /></label><label className="full-field">یادداشت<textarea value={quoteForm.notes} onChange={event => setQuoteForm({ ...quoteForm, notes: event.target.value })} /></label></div><div className="form-actions"><button type="button" className="button button-ghost" onClick={() => setShowQuoteForm(false)}>انصراف</button><button className="button button-primary"><ClipboardList size={15} /> ثبت استعلام</button></div></form></div>}
  </div>;
}
