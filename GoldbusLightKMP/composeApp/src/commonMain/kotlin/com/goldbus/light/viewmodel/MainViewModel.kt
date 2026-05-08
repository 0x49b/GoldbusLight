package com.goldbus.light.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.goldbus.light.api.WLEDClient
import com.goldbus.light.discovery.DiscoveryService
import com.goldbus.light.model.WLEDDevice
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class MainViewModel(
    private val wledClient: WLEDClient,
    private val discoveryService: DiscoveryService
) : ViewModel() {

    private val _devices = MutableStateFlow<List<WLEDDevice>>(emptyList())
    val devices: StateFlow<List<WLEDDevice>> = _devices.asStateFlow()

    private val _isDiscovering = MutableStateFlow(false)
    val isDiscovering: StateFlow<Boolean> = _isDiscovering.asStateFlow()

    init {
        startDiscovery()
    }

    fun startDiscovery() {
        viewModelScope.launch {
            _isDiscovering.value = true
            discoveryService.discover().collect { device ->
                val currentList = _devices.value.toMutableList()
                val existingIndex = currentList.indexOfFirst { it.id == device.id }
                if (existingIndex != -1) {
                    currentList[existingIndex] = device
                } else {
                    currentList.add(device)
                }
                _devices.value = currentList
            }
        }
    }

    fun toggleDevice(device: WLEDDevice) {
        viewModelScope.launch {
            try {
                val currentState = wledClient.getState(device)
                // Toggle logic here
            } catch (e: Exception) {
                // Handle error
            }
        }
    }
}