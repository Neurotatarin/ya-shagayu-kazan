import type { CatalogRepository, DemoCatalog } from "../domain/demo";

// All content below is local design-preview data. No AI, routing or backend call.
const catalog: DemoCatalog = {
  places: [
    { id: "ushkova", title: "Дом Ушковой", eyebrow: "ДОМ, КОТОРЫЙ УМЕЕТ УДИВЛЯТЬ", address: "Кремлёвская улица, 33", description: "Один фасад — и целый мир внутри.\nПрисмотрись к деталям, пока Зилант\nрассказывает историю этого дома.", photo: "place.imgUshkovaJpg", durationSeconds: 260 },
    { id: "kul-sharif", title: "Мечеть Кул-Шариф", eyebrow: "БЛИЖАЙШАЯ ИСТОРИЯ", description: "Текст и готовая аудиозапись этой истории будут добавлены позже.", photo: "map.imgKulSharifJpg", durationSeconds: 240 },
  ],
  routes: [
    { id: "heart", title: "Сердце\nКазани", description: "Кремль и\nглавные символы", meta: "6 мест · 90 мин · 2 км", theme: "heart", nodeId: "11:8942" },
    { id: "imperial", title: "Имперская\nКазань", description: "Барокко и\nкупеческий\nгород", meta: "5 мест · 100 мин · 2,2 км", theme: "imperial", nodeId: "11:9283" },
    { id: "tatar", title: "Татарская\nКазань", description: "Слобода, мечети\nи озеро Кабан", meta: "5 мест · 110 мин · 2,5 км", theme: "tatar", nodeId: "11:9709" },
    { id: "three-hours", title: "Казань\nза 3 часа", description: "Главные места\nза три часа", meta: "5 мест · 180 мин · 3,2 км", theme: "threeHours", nodeId: "11:10139" },
    { id: "modern", title: "Новая\nКазань", description: "Архитектура\nнового города", meta: "4 места · 150 мин · 4 км", theme: "modern", nodeId: "11:10644" },
  ],
};

export const localCatalogRepository: CatalogRepository = {
  async getCatalog(signal) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    return catalog;
  },
};
