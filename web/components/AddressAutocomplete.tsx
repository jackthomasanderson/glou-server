"use client";

import React, { useState, useEffect, useRef } from "react";

interface AddressAutocompleteProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    id?: string;
    name?: string;
}

interface PhotonFeature {
    properties: {
        name?: string;
        street?: string;
        housenumber?: string;
        postcode?: string;
        city?: string;
        town?: string;
        village?: string;
        country?: string;
        state?: string;
    };
}

export function AddressAutocomplete({
    value,
    onChange,
    placeholder,
    id,
    name,
}: AddressAutocompleteProps) {
    const [query, setQuery] = useState(value);
    const [suggestions, setSuggestions] = useState<PhotonFeature[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const shouldSearch = useRef(false);

    useEffect(() => {
        if (value !== query) {
            setQuery(value);
            // Do not trigger search when checking sync from parent
            shouldSearch.current = false;
        }
    }, [value]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const fetchAddresses = async (search: string) => {
        if (!search || search.length < 3) {
            setSuggestions([]);
            return;
        }

        setIsLoading(true);
        try {
            // Using Photon API (OpenStreetMap based) for better autocomplete performance and less strict headers
            const response = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(search)}&limit=5&lang=fr`);
            if (response.ok) {
                const data = await response.json();
                setSuggestions(data.features || []);
                setIsOpen(true);
            }
        } catch (error) {
            console.error("Address search error:", error);
        } finally {
            setIsLoading(false);
        }
    };

    // Debounced search effect
    useEffect(() => {
        if (!shouldSearch.current) return;

        const timer = setTimeout(() => {
            if (query.length >= 3) {
                fetchAddresses(query);
            } else {
                setSuggestions([]);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [query]);

    const formatAddress = (props: PhotonFeature["properties"]) => {
        const parts = [];

        if (props.name) parts.push(props.name);
        if (props.housenumber && props.street) {
            // Avoid duplicating street if name is same as street
            if (props.name !== props.street) parts.push(`${props.housenumber} ${props.street}`);
        } else if (props.street && props.name !== props.street) {
            parts.push(props.street);
        }

        const city = props.city || props.town || props.village;
        if (city && city !== props.name) {
            parts.push(city);
        }

        if (props.country) parts.push(props.country);

        return parts.join(", ");
    };

    const handleSelect = (address: string) => {
        shouldSearch.current = false; // Prevent search on selection update
        setQuery(address);
        onChange(address);
        setSuggestions([]);
        setIsOpen(false);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        shouldSearch.current = true; // Use is typing
        setQuery(newValue);
        onChange(newValue);
    };

    return (
        <div className="address-autocomplete" ref={wrapperRef} style={{ position: "relative", width: "100%" }}>
            <input
                id={id}
                name={name}
                type="text"
                value={query}
                onChange={handleInputChange}
                onFocus={() => { if (suggestions.length > 0) setIsOpen(true); }}
                placeholder={placeholder}
                autoComplete="off"
                style={{ width: "100%", paddingRight: "30px" }}
                className="field-input"
            />
            {isOpen && suggestions.length > 0 && (
                <ul className="suggestions-list" style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    zIndex: 1000,
                    backgroundColor: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "0 0 8px 8px",
                    maxHeight: "200px",
                    overflowY: "auto",
                    listStyle: "none",
                    padding: 0,
                    margin: 0,
                    boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
                }}>
                    {suggestions.map((feature, index) => {
                        const label = formatAddress(feature.properties);
                        return (
                            <li
                                key={index}
                                onClick={() => handleSelect(label)}
                                style={{
                                    padding: "8px 12px",
                                    cursor: "pointer",
                                    borderBottom: index < suggestions.length - 1 ? "1px solid var(--border)" : "none",
                                    color: "var(--text)"
                                }}
                                className="suggestion-item"
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = "var(--bg)";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = "transparent";
                                }}
                            >
                                <div style={{ fontWeight: 500, fontSize: "0.95em" }}>{label}</div>
                                <div style={{ fontSize: "0.8em", opacity: 0.7 }}>
                                    {[feature.properties.postcode, feature.properties.state].filter(Boolean).join(", ")}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
            {isLoading && <div style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", opacity: 0.5 }}>...</div>}
        </div>
    );
}
