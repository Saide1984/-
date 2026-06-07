const DEFAULT_FAMILY_DATA = [
    {
        id: 1,
        name: "فاطمة أقريض",
        role: "الأم",
        gender: "female",
        birthPlace: "تنالت",
        birthDate: "1940",
        deathPlace: "الدار البيضاء",
        deathDate: "2010",
        photo: "images/فاطمة أقريض.jpg",
        notes: "جدة العائلة - رحمها الله",
        parentId: null,
        spouses: [{ id: 2 }],
        fatherName: "",
        motherName: ""
    },
    {
        id: 2,
        name: "سعيد بركاش",
        role: "الأب",
        gender: "male",
        birthPlace: "تنالت",
        birthDate: "1938",
        deathPlace: "الدار البيضاء",
        deathDate: "2005",
        photo: "images/بركاش سعيد.jpg",
        notes: "جد العائلة - رحمه الله",
        parentId: null,
        spouses: [{ id: 1 }],
        fatherName: "",
        motherName: ""
    },
    {
        id: 3,
        name: "محمد بركاش",
        role: "ابن",
        gender: "male",
        birthPlace: "الدار البيضاء",
        birthDate: "1960",
        deathPlace: "",
        deathDate: "",
        photo: "images/بركاش محمد.jpg",
        notes: "",
        parentId: 2,
        spouses: [],
        fatherName: "سعيد بركاش",
        motherName: "فاطمة أقريض"
    },
    {
        id: 4,
        name: "ليلى بركاش",
        role: "ابنة",
        gender: "female",
        birthPlace: "الدار البيضاء",
        birthDate: "1962",
        deathPlace: "",
        deathDate: "",
        photo: "images/ليلى بركاش.jpg",
        notes: "",
        parentId: 2,
        spouses: [{ id: null, name: "شاليم" }],
        fatherName: "سعيد بركاش",
        motherName: "فاطمة أقريض"
    },
    {
        id: 5,
        name: "أحمد بركاش",
        role: "ابن",
        gender: "male",
        birthPlace: "الدار البيضاء",
        birthDate: "1965",
        deathPlace: "",
        deathDate: "",
        photo: "images/default.svg",
        notes: "",
        parentId: 2,
        spouses: [],
        fatherName: "سعيد بركاش",
        motherName: "فاطمة أقريض"
    },
    {
        id: 6,
        name: "خالد بركاش",
        role: "ابن",
        gender: "male",
        birthPlace: "الدار البيضاء",
        birthDate: "1968",
        deathPlace: "",
        deathDate: "",
        photo: "images/default.svg",
        notes: "",
        parentId: 2,
        spouses: [],
        fatherName: "سعيد بركاش",
        motherName: "فاطمة أقريض"
    },
    {
        id: 7,
        name: "نسيم شاليم",
        role: "حفيدة",
        gender: "female",
        birthPlace: "الدار البيضاء",
        birthDate: "1990",
        deathPlace: "",
        deathDate: "",
        photo: "images/نسيم شاليم.jpg",
        notes: "",
        parentId: 4,
        spouses: [],
        fatherName: "شاليم",
        motherName: "ليلى بركاش"
    },
    {
        id: 8,
        name: "أروى شاليم",
        role: "حفيدة",
        gender: "female",
        birthPlace: "الدار البيضاء",
        birthDate: "1993",
        deathPlace: "",
        deathDate: "",
        photo: "images/أروى شاليم.jpg",
        notes: "",
        parentId: 4,
        spouses: [],
        fatherName: "شاليم",
        motherName: "ليلى بركاش"
    }
];

function migrateData(data) {
    return data.map(member => {
        const hasOldFields = member.spouseId != null || (member.spouseName && member.spouseName.trim());
        const hasNewSpouses = member.spouses && member.spouses.length > 0;

        if (hasNewSpouses && !hasOldFields) return member;

        const spouses = hasNewSpouses ? [...member.spouses] : [];
        if (member.spouseId != null) {
            const alreadyHas = spouses.some(s => s.id === member.spouseId);
            if (!alreadyHas) spouses.push({ id: member.spouseId });
        }
        if (member.spouseName && member.spouseName.trim()) {
            const alreadyHas = spouses.some(s => s.id == null && s.name === member.spouseName.trim());
            if (!alreadyHas) spouses.push({ id: null, name: member.spouseName.trim() });
        }
        const migrated = { ...member, spouses };
        delete migrated.spouseId;
        delete migrated.spouseName;
        return migrated;
    });
}

function loadFamilyData() {
    const saved = localStorage.getItem('familyTreeData');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            return migrateData(data);
        } catch (e) {
            return [...DEFAULT_FAMILY_DATA];
        }
    }
    return [...DEFAULT_FAMILY_DATA];
}

function saveFamilyData(data) {
    localStorage.setItem('familyTreeData', JSON.stringify(data));
}

function getNextId(data) {
    return data.length > 0 ? Math.max(...data.map(m => m.id)) + 1 : 1;
}
