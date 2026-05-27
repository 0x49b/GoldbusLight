package goldbus.persistence

import goldbus.domain.GeneralTabState
import goldbus.domain.PersistentState

interface StateRepository {
    val persistencePath: String

    suspend fun loadState(): PersistentState

    suspend fun saveState(state: PersistentState)

    suspend fun loadGeneralTabState(): GeneralTabState

    suspend fun saveGeneralTabState(state: GeneralTabState)
}
